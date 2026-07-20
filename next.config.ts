import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
