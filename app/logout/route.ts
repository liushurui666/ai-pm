export { GET } from "@/lib/auth/hosted-auth";

// 退出需要交给 Better Auth 清理会话 Cookie，固定 Node.js runtime 以支持 SDK 服务端 handler。
export const runtime = "nodejs";
