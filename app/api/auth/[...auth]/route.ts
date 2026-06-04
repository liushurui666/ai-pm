export { GET, POST } from "@/lib/auth/hosted-auth";

// 认证路由需要使用 Better Auth + PostgreSQL 连接池，必须运行在 Node.js runtime，不能被 Next 放到 Edge。
export const runtime = "nodejs";
