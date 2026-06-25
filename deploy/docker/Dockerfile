# syntax=docker/dockerfile:1.7

# AI PM 生产镜像。选择 Node 22 是因为本项目使用 Next 16 与 React 19，和当前本地开发环境保持一致。
FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma 在容器内执行 generate/migrate 时会探测 OpenSSL；slim 镜像默认不完整，
# 这里补齐 openssl 与 CA 证书，避免生产启动时出现 libssl 探测警告或 TLS 连接异常。
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 只先复制依赖清单，充分利用 Docker 层缓存；后续业务代码变化不会反复下载依赖。
COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
  && corepack prepare pnpm@10.15.1 --activate \
  && pnpm install --frozen-lockfile

FROM deps AS builder

WORKDIR /app

# .dockerignore 会排除本地密钥、node_modules、.next 等运行时产物，避免把敏感文件打进镜像。
COPY . .

# Prisma Client 的类型与运行时代码依赖 schema.prisma 生成；deps 阶段为了缓存只复制依赖清单，
# 当时还没有 prisma 目录，因此必须在复制完整源码后先生成 Client，再执行 Next 构建。
RUN APP_URL="http://localhost:3004" \
  AUTH_DATABASE_URL="postgresql://ai_pm_build:ai_pm_build@127.0.0.1:5432/ai_pm_build" \
  BETTER_AUTH_SECRET="docker-build-placeholder-secret" \
  pnpm db:generate \
  && pnpm build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

# 运行阶段同样需要 OpenSSL：容器启动入口会先执行 Prisma migrate，再启动 Next 服务。
# Bug AI 修复 worker 会在容器内 clone 目标仓库并创建修复分支，因此生产 runner 必须带 git；
# 否则 Web 能创建 bug_fix_jobs，但后台 worker 会在第一步 `git clone` 直接失败。
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.15.1 --activate

# 运行镜像保留完整发布目录，原因是容器启动时需要 Prisma CLI 执行迁移，同时 Next start 需要 .next 构建产物。
COPY --from=builder /app ./

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3003

ENTRYPOINT ["scripts/docker-entrypoint.sh"]
# 通过 PORT 读取容器端口，方便同一镜像热插拔到不同服务器；仍然直接调用 Next CLI，避免 `pnpm start -- -p` 被解析成项目目录。
CMD ["sh", "-c", "pnpm exec next start -p \"${PORT:-3003}\""]
