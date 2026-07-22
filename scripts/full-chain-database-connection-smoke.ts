import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const REPEATED_CLIENT_READS = 20;
const DASHBOARD_READS = 20;

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  // 动态导入必须放在 dotenv 之后，避免脚本被单独执行时 Prisma 比 DATABASE_URL 更早初始化。
  const [{ getDashboardData }, { getPrismaClient, MYSQL_POOL_DEFAULTS, resolveMariaDbMinimumIdle }] = await Promise.all([
    import("../src/data/local-dashboard"),
    import("../src/lib/database/prisma")
  ]);
  const prisma = getPrismaClient();
  try {
    const repeatedClients = Array.from({ length: REPEATED_CLIENT_READS }, () => getPrismaClient());

    // 此断言直接覆盖本次故障：production 进程内不得因为多次 getter 创建多个 adapter pool。
    assertSmoke(
      repeatedClients.every((candidate) => candidate === prisma),
      "production 进程内 getPrismaClient 没有复用同一实例。"
    );
    assertSmoke(process.env.NODE_ENV === "production", "连接回归必须以 NODE_ENV=production 运行。");
    assertSmoke(MYSQL_POOL_DEFAULTS.connectionLimit === 5, "MariaDB connectionLimit 缺省值不是 5。");
    assertSmoke(MYSQL_POOL_DEFAULTS.minimumIdle === 1, "MariaDB minimumIdle 缺省值不是 1。");
    assertSmoke(MYSQL_POOL_DEFAULTS.idleTimeout === 60, "MariaDB idleTimeout 缺省值不是 60 秒。");
    assertSmoke(resolveMariaDbMinimumIdle(null) === 1, "缺省 minimumIdle 没有收敛到 1。");
    assertSmoke(resolveMariaDbMinimumIdle("0") === 1, "minimumIdle=0 没有收敛到 1。");
    assertSmoke(resolveMariaDbMinimumIdle("-2") === 1, "负数 minimumIdle 没有收敛到 1。");
    assertSmoke(resolveMariaDbMinimumIdle("invalid") === 1, "非数字 minimumIdle 没有收敛到 1。");
    assertSmoke(resolveMariaDbMinimumIdle("3") === 3, "合法 minimumIdle 显式值没有保留。");

    const initialData = await getDashboardData();
    const workspaceId = initialData.meta?.currentWorkspace?.id;

    assertSmoke(workspaceId, "dashboard 读取没有返回当前工作区。");

    // 交错传入/不传入 workspaceId，覆盖 SSR 首屏和 dashboard API 的两种调用形态。
    // 每批 5 个并发读取会让 pool 真实扩容到上限，也能及时暴露每次读取新建 client 的回归。
    for (let offset = 0; offset < DASHBOARD_READS; offset += MYSQL_POOL_DEFAULTS.connectionLimit) {
      await Promise.all(
        Array.from({ length: MYSQL_POOL_DEFAULTS.connectionLimit }, (_, index) =>
          getDashboardData(undefined, (offset + index) % 2 === 0 ? workspaceId : undefined)
        )
      );
    }

    const connectionIds = await Promise.all(
      Array.from({ length: REPEATED_CLIENT_READS }, () =>
        prisma.$transaction(async (transaction) => {
          const rows = await transaction.$queryRawUnsafe<Array<{ connectionId: bigint | number }>>(
            "SELECT CONNECTION_ID() AS connectionId"
          );

          // 短暂持有事务连接，确保 20 个并发请求能真实观测 pool 的物理连接上限。
          await transaction.$queryRawUnsafe("SELECT SLEEP(0.05)");

          return Number(rows[0]?.connectionId);
        })
      )
    );
    const uniqueConnectionIds = new Set(connectionIds.filter(Number.isFinite));

    assertSmoke(uniqueConnectionIds.size > 0, "未观测到 MariaDB 物理连接。");
    assertSmoke(
      uniqueConnectionIds.size <= MYSQL_POOL_DEFAULTS.connectionLimit,
      `单进程观测到 ${uniqueConnectionIds.size} 条连接，超过 pool 上限 ${MYSQL_POOL_DEFAULTS.connectionLimit}。`
    );
    assertSmoke(getPrismaClient() === prisma, "dashboard 交错读取后 PrismaClient 实例发生了变化。");

    console.log(JSON.stringify({
      ok: true,
      nodeEnv: process.env.NODE_ENV,
      repeatedClientReads: REPEATED_CLIENT_READS,
      dashboardReads: DASHBOARD_READS,
      observedPhysicalConnections: uniqueConnectionIds.size,
      pool: MYSQL_POOL_DEFAULTS
    }));
  } finally {
    // 断言或查询失败时也要立即关闭 pool，避免 smoke 因 idle timeout 在 CI 中多挂 60 秒。
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // 输出只保留可操作的错误文本，不打印 Prisma 对象或 DATABASE_URL，避免连接串随诊断日志泄露。
  console.error(error instanceof Error ? error.message : "数据库连接回归失败。");
  process.exitCode = 1;
});
