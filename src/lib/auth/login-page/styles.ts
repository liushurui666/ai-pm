// 登录页以内联 CSS 返回。当前设计目标是严格还原用户指定的 1599x800 效果图，
// 因此复杂星空、浮动项目卡片和环形平台都使用设计图资产承载，真实 OAuth 链接以透明热区覆盖。
export const aiPmLoginPageStyles = `
:root{color-scheme:dark;background:#050a10;color:#eef7ff;font-family:Inter,"PingFang SC","Microsoft YaHei",Arial,sans-serif}
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{overflow:hidden;background:#050a10}
.login-shell{position:relative;width:100vw;height:100vh;min-width:320px;min-height:560px;overflow:hidden;background:#050a10}
.login-artboard{position:absolute;left:0;top:0;width:100%;height:100%;background-image:url("/images/auth/login-reference-exact.png");background-size:100% 100%;background-position:center;background-repeat:no-repeat}
.login-sr-title,.login-sr-description{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.login-hotspots{position:absolute;inset:0;z-index:2}
.login-hotspot{position:absolute;display:block;border-radius:8px;text-decoration:none;outline:none}
.login-hotspot:focus-visible{box-shadow:0 0 0 3px rgba(103,215,255,.9),0 0 0 7px rgba(55,112,255,.34)}
.login-hotspot-feishu{left:72.02%;top:48.38%;width:20.14%;height:6.88%}
.login-hotspot-google{left:72.02%;top:60.25%;width:9.77%;height:9.75%}
.login-hotspot-github{left:82.39%;top:60.25%;width:9.77%;height:9.75%}
.login-error{position:absolute;left:71.86%;top:40.9%;z-index:3;width:20.32%;height:5.5%;display:flex;align-items:center;padding:0 14px;border:1px solid rgba(255,102,120,.55);border-radius:6px;color:#ffd4dc;background:rgba(90,24,36,.68);font-size:13px;line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.login-client-id{position:absolute;left:72%;top:73%;z-index:1;width:20%;height:3%;color:transparent;font-size:12px;pointer-events:none}
.login-provider-empty{position:absolute;left:71.86%;top:48.38%;z-index:4;width:20.32%;padding:14px;border:1px dashed rgba(141,197,255,.42);border-radius:8px;color:rgba(230,240,255,.86);background:rgba(8,18,32,.82);font-size:14px;line-height:1.55}
@media (max-width:760px){.login-artboard{background-size:auto 100%;background-position:86% center}.login-error{left:9.5%;top:40.9%;width:82%;height:5.5%;font-size:12px}.login-hotspot-feishu{left:9.5%;top:48.38%;width:82%;height:6.88%}.login-hotspot-google{left:9.5%;top:60.25%;width:39.5%;height:9.75%}.login-hotspot-github{left:52%;top:60.25%;width:39.5%;height:9.75%}.login-provider-empty{left:9.5%;top:48.38%;width:82%}}
`;
