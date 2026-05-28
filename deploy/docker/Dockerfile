# syntax=docker/dockerfile:1.7

# AI PM 生产镜像。选择 Node 22 是因为本项目使用 Next 16 与 React 19，和当前本地开发环境保持一致。
FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1

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
RUN pnpm db:generate \
  && pnpm build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

RUN corepack enable \
  && corepack prepare pnpm@10.15.1 --activate

# 运行镜像保留完整发布目录，原因是容器启动时需要 Prisma CLI 执行迁移，同时 Next start 需要 .next 构建产物。
COPY --from=builder /app ./

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3003

ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["pnpm", "start", "--", "-p", "3003"]
