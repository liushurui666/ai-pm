// 登录页以内联 CSS 返回，首屏不再加载站内 JS；背景使用压缩后的原创视觉资产承载沉浸感，
// 页面结构只保留认证入口和必要产品信息，避免用复杂 DOM 伪装 WebGL 导致文字遮挡和性能浪费。
export const aiPmLoginPageStyles = `
:root{color-scheme:dark;font-family:Inter,"PingFang SC","Microsoft YaHei",Arial,sans-serif;background:#02060d;color:#eef7ff}
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{overflow-x:hidden;background:#02060d}
.login-shell{position:relative;min-height:100vh;padding:28px clamp(24px,4vw,72px);display:grid;grid-template-rows:auto 1fr;isolation:isolate;overflow:hidden;background-image:linear-gradient(90deg,rgba(2,6,13,.84) 0%,rgba(2,8,18,.52) 42%,rgba(2,6,13,.8) 100%),linear-gradient(180deg,rgba(2,6,13,.34),rgba(2,6,13,.88)),url("/images/auth/login-command-center.jpg");background-size:cover;background-position:center;background-repeat:no-repeat}
.login-shell:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(circle at 21% 35%,rgba(92,233,255,.2),transparent 28%),radial-gradient(circle at 77% 46%,rgba(87,255,193,.18),transparent 30%),linear-gradient(rgba(160,232,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(160,232,255,.035) 1px,transparent 1px);background-size:auto,auto,72px 72px,72px 72px;mask-image:linear-gradient(to bottom,transparent 0%,#000 20%,#000 82%,transparent 100%);pointer-events:none}
.login-shell:after{content:"";position:absolute;inset:auto 8% 0 8%;height:26%;z-index:-1;background:linear-gradient(rgba(101,232,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(101,232,255,.06) 1px,transparent 1px);background-size:58px 58px;transform:perspective(900px) rotateX(64deg);transform-origin:50% 100%;opacity:.55;pointer-events:none}
.login-topbar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px}
.login-brand{display:inline-flex;align-items:center;gap:12px;min-width:0}
.login-mark{width:42px;height:42px;border:1px solid rgba(135,228,255,.48);border-radius:12px;display:grid;place-items:center;color:#9af5ff;background:linear-gradient(145deg,rgba(16,34,57,.92),rgba(19,172,160,.25));box-shadow:0 16px 52px rgba(32,218,255,.2)}
.login-brand strong{display:block;font-size:15px;letter-spacing:0}.login-brand span{display:block;margin-top:3px;color:rgba(222,235,255,.62);font-size:12px}
.login-status{padding:8px 12px;border:1px solid rgba(146,214,255,.23);border-radius:999px;color:rgba(227,243,255,.78);background:rgba(5,12,24,.52);backdrop-filter:blur(18px);white-space:nowrap;font-size:12px}
.login-main{position:relative;z-index:1;width:min(1240px,100%);min-height:calc(100vh - 98px);margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,440px);align-items:center;gap:clamp(46px,7vw,116px);padding:24px 0 48px}
.login-hero{position:relative;display:flex;align-items:center;min-height:460px}
.login-copy{max-width:680px;padding-top:20px}
.login-kicker{display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(118,245,218,.28);border-radius:999px;color:#7ef4d9;background:rgba(5,22,30,.56);box-shadow:0 12px 38px rgba(57,255,208,.1);font-size:12px;font-weight:700}
.login-kicker:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 16px currentColor}
.login-copy h1{margin:22px 0 18px;max-width:720px;color:#fff;font-size:clamp(48px,4.8vw,72px);line-height:1.04;letter-spacing:0;text-wrap:balance;text-shadow:0 22px 70px rgba(0,0,0,.62)}
.login-copy p{max-width:600px;margin:0;color:rgba(220,235,249,.76);font-size:17px;line-height:1.9;text-shadow:0 12px 38px rgba(0,0,0,.55)}
.login-flow{display:inline-flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:34px;padding:10px;border:1px solid rgba(148,215,255,.14);border-radius:16px;background:rgba(5,12,24,.44);backdrop-filter:blur(16px)}
.login-flow span{position:relative;min-width:58px;padding:10px 13px;border:1px solid rgba(149,222,255,.18);border-radius:10px;color:rgba(240,248,255,.92);background:linear-gradient(180deg,rgba(14,33,56,.82),rgba(7,18,33,.62));text-align:center;font-size:13px;font-weight:700}
.login-flow span:not(:last-child):after{content:"";position:absolute;right:-10px;top:50%;width:10px;height:1px;background:rgba(125,241,218,.62)}
.login-panel{position:relative;overflow:hidden;border:1px solid rgba(153,219,255,.22);border-radius:18px;padding:31px;background:linear-gradient(180deg,rgba(13,29,52,.9),rgba(5,11,23,.92));box-shadow:0 32px 100px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.1);backdrop-filter:blur(24px)}
.login-panel:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 20% 0%,rgba(101,255,213,.18),transparent 31%),radial-gradient(circle at 92% 12%,rgba(100,196,255,.18),transparent 26%),linear-gradient(90deg,rgba(255,255,255,.07),transparent 30%)}
.login-panel>*{position:relative;z-index:1}.login-panel-kicker{color:#70f7d9;font-size:12px;font-weight:800}
.login-panel h2{margin:12px 0 10px;color:#fff;font-size:30px;line-height:1.18;letter-spacing:0}.login-panel p{margin:0 0 22px;color:rgba(218,232,247,.66);font-size:14px;line-height:1.7}
.login-error{margin:0 0 16px;padding:12px 14px;border:1px solid rgba(255,92,120,.45);border-radius:10px;color:#ffd5dc;background:rgba(96,20,34,.45)}
.login-providers{display:grid;gap:16px}.login-provider{min-height:54px;display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:10px;text-decoration:none;font-weight:800;transition:transform 160ms ease,border-color 160ms ease,background 160ms ease}
.login-provider:hover{transform:translateY(-1px)}.login-provider-primary{color:#021018;background:linear-gradient(135deg,#6df0ce,#70c9ff);box-shadow:0 18px 54px rgba(87,220,255,.3)}
.login-provider-secondary{color:rgba(238,246,255,.94);border:1px solid rgba(150,205,255,.2);background:rgba(7,16,30,.78)}
.login-provider-icon{width:22px;height:22px;display:inline-grid;place-items:center}.login-provider-icon svg,.login-provider-icon img{max-width:22px;max-height:22px}
.login-divider{display:flex;align-items:center;gap:12px;color:rgba(211,226,241,.48);font-size:12px}.login-divider:before,.login-divider:after{content:"";height:1px;flex:1;background:rgba(177,215,255,.14)}
.login-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.login-provider-empty{padding:14px;border:1px dashed rgba(168,217,255,.28);border-radius:10px;color:rgba(225,238,255,.7);background:rgba(8,17,31,.58)}
.login-footer{margin-top:20px;color:rgba(206,222,241,.48);font-size:12px}
@media (max-width:980px){.login-shell{padding:22px 18px 30px;background-position:center top}.login-main{grid-template-columns:1fr;gap:30px;min-height:auto;padding:48px 0 36px}.login-hero{min-height:auto}.login-copy{max-width:760px}.login-copy h1{font-size:clamp(42px,8vw,64px)}.login-panel{max-width:560px;width:100%;justify-self:center}}
@media (max-width:560px){.login-status{display:none}.login-shell{padding:20px 18px 28px;background-position:49% top}.login-main{padding:44px 0 28px;gap:28px}.login-copy{padding-top:0}.login-copy h1{font-size:clamp(38px,11vw,46px);line-height:1.08}.login-copy p{font-size:15px;line-height:1.75}.login-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;gap:8px}.login-flow span{min-width:0;padding:9px 8px}.login-flow span:after{display:none}.login-panel{padding:24px}.login-panel h2{font-size:28px}.login-provider-grid{grid-template-columns:1fr}}
`;
