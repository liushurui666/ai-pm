import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 统一认证 SDK 已发布为组织 npm 包；继续交给 Next 转译，避免 ESM 子路径导出在服务端构建时出现兼容差异。
  transpilePackages: ["@rc-tool/unified-auth-sdk", "@rc-tool/unified-auth-hosted-service"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.less": {
        loaders: ["less-loader"],
        as: "*.css"
      }
    }
  }
};

export default nextConfig;
