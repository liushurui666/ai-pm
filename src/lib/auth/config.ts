import config, { resolveUnifiedAuthProviderCredentials } from "../../../unified-auth.config";

/**
 * AI PM 的 Unified Auth 单一配置入口。
 *
 * 根目录的 unified-auth.config.ts 同时服务于业务代码和 `unified-auth` CLI；这里再导出一次，是为了让
 * src/lib/auth 下面的运行时代码始终从同一个对象读取 app、realm、数据库和 Better Auth 配置，避免旧版
 * 分散环境变量重新扩散到业务模块里。
 */
export const unifiedAuthConfig = config;

export { resolveUnifiedAuthProviderCredentials };

export default unifiedAuthConfig;
