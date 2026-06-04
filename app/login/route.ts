export { GET } from "@/lib/auth/hosted-auth";

// 登录页会读取同一套 Better Auth 服务配置，固定 Node.js runtime 以保持和 /api/auth/* 一致。
export const runtime = "nodejs";
