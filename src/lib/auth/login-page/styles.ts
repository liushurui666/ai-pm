// 登录页样式以内联 CSS 交给 Hosted Auth 返回，避免公开登录入口再额外请求站内 CSS/JS，
// 同时用纯 CSS 模拟 WebGL 项目宇宙的空间感，保证首屏品牌感和认证性能都可控。
export const aiPmLoginPageStyles = `
:root{color-scheme:dark;font-family:Inter,"PingFang SC","Microsoft YaHei",Arial,sans-serif;background:#030711;color:#eef7ff}
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{overflow-x:hidden;background:radial-gradient(circle at 18% 12%,rgba(73,217,255,.22),transparent 30%),radial-gradient(circle at 80% 18%,rgba(48,255,174,.16),transparent 28%),linear-gradient(135deg,#040812 0%,#081222 46%,#020409 100%)}
.login-shell{position:relative;min-height:100vh;padding:28px clamp(20px,4vw,64px);display:grid;grid-template-rows:auto 1fr;isolation:isolate;overflow:hidden}
.login-shell:before,.login-shell:after{content:"";position:absolute;inset:-18%;z-index:-3;pointer-events:none}
.login-shell:before{background:linear-gradient(rgba(145,241,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(145,241,255,.045) 1px,transparent 1px);background-size:64px 64px;transform:perspective(900px) rotateX(63deg) translateY(8%);transform-origin:50% 100%;mask-image:linear-gradient(to bottom,transparent,#000 22%,#000 66%,transparent)}
.login-shell:after{background:radial-gradient(circle at 42% 45%,rgba(53,214,255,.16),transparent 22%),radial-gradient(circle at 60% 58%,rgba(55,255,183,.13),transparent 24%);filter:blur(30px);opacity:.85}
.login-topbar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px}
.login-brand{display:inline-flex;align-items:center;gap:12px;min-width:0}
.login-mark{width:42px;height:42px;border:1px solid rgba(133,230,255,.45);border-radius:12px;display:grid;place-items:center;color:#8df3ff;background:linear-gradient(145deg,rgba(17,37,62,.96),rgba(15,140,147,.34)),radial-gradient(circle at 30% 20%,rgba(255,255,255,.36),transparent 30%);box-shadow:0 16px 52px rgba(12,232,255,.18)}
.login-brand strong{display:block;font-size:15px;letter-spacing:0}.login-brand span{display:block;margin-top:3px;color:rgba(222,235,255,.58);font-size:12px}
.login-status{padding:8px 12px;border:1px solid rgba(130,207,255,.2);border-radius:999px;color:rgba(223,242,255,.72);background:rgba(5,12,24,.58);backdrop-filter:blur(18px);white-space:nowrap;font-size:12px}
.login-main{position:relative;z-index:1;width:min(1180px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,1.18fr) minmax(360px,440px);align-items:center;gap:clamp(28px,6vw,88px);padding:clamp(44px,7vh,86px) 0 40px}
.login-hero{position:relative;min-height:540px;display:flex;align-items:center}
.login-orbit{position:absolute;inset:2% -8% 0 -10%;z-index:-1}
.login-orbit-ring,.login-orbit-ring:before,.login-orbit-ring:after{position:absolute;content:"";border:1px solid rgba(144,235,255,.18);border-radius:50%;transform:rotateX(68deg) rotateZ(-18deg);box-shadow:0 0 60px rgba(33,209,255,.08)}
.login-orbit-ring{width:min(620px,78vw);height:min(620px,78vw);left:10%;top:4%}.login-orbit-ring:before{inset:72px}.login-orbit-ring:after{inset:150px}
.login-node{position:absolute;min-width:118px;padding:12px 14px;border:1px solid rgba(162,231,255,.18);border-radius:10px;background:linear-gradient(145deg,rgba(11,23,42,.72),rgba(18,58,74,.42));box-shadow:0 18px 58px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.1);backdrop-filter:blur(18px)}
.login-node strong{display:block;color:rgba(245,250,255,.94);font-size:13px;font-weight:700}.login-node span{display:block;margin-top:5px;color:rgba(196,221,235,.62);font-size:11px}
.login-node:before{content:"";position:absolute;width:8px;height:8px;right:12px;top:13px;border-radius:50%;background:#39ffbd;box-shadow:0 0 24px rgba(57,255,189,.8)}
.node-plan{left:9%;top:22%}.node-risk{left:56%;top:14%}.node-bug{left:47%;top:60%}.node-ship{left:18%;top:70%}
.login-pulse{position:absolute;width:220px;height:220px;left:34%;top:34%;border-radius:50%;background:radial-gradient(circle,rgba(151,255,232,.9) 0 3px,transparent 4px),radial-gradient(circle,rgba(60,218,255,.22),transparent 58%);box-shadow:0 0 80px rgba(47,223,255,.25)}
.login-copy{max-width:590px}.login-kicker{display:inline-flex;align-items:center;gap:9px;padding:8px 11px;border:1px solid rgba(123,240,211,.22);border-radius:999px;color:#7bf0d3;background:rgba(8,28,35,.48);font-size:12px}
.login-kicker:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 16px currentColor}
.login-copy h1{margin:22px 0 18px;max-width:640px;color:#fff;font-size:clamp(46px,7vw,82px);line-height:.96;letter-spacing:0}
.login-copy p{max-width:560px;margin:0;color:rgba(222,235,255,.72);font-size:17px;line-height:1.85}
.login-signals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:560px;margin-top:34px}
.login-signal{min-height:82px;padding:14px;border:1px solid rgba(145,214,255,.16);border-radius:10px;background:rgba(7,17,32,.56);backdrop-filter:blur(16px)}
.login-signal strong{display:block;color:#fff;font-size:20px}.login-signal span{display:block;margin-top:7px;color:rgba(213,229,244,.58);font-size:12px;line-height:1.4}
.login-panel{position:relative;overflow:hidden;border:1px solid rgba(145,214,255,.18);border-radius:16px;padding:30px;background:linear-gradient(180deg,rgba(12,25,46,.92),rgba(7,13,25,.94)),radial-gradient(circle at 18% 0%,rgba(71,255,190,.18),transparent 30%);box-shadow:0 32px 100px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(26px)}
.login-panel:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,.08),transparent 22%),radial-gradient(circle at 90% 15%,rgba(71,207,255,.18),transparent 24%)}
.login-panel>*{position:relative;z-index:1}.login-panel-kicker{color:#69f4ce;font-size:12px;font-weight:700}
.login-panel h2{margin:12px 0 10px;color:#fff;font-size:30px;line-height:1.18;letter-spacing:0}.login-panel p{margin:0 0 22px;color:rgba(218,232,247,.66);font-size:14px;line-height:1.7}
.login-error{margin:0 0 16px;padding:12px 14px;border:1px solid rgba(255,92,120,.45);border-radius:10px;color:#ffd5dc;background:rgba(96,20,34,.45)}
.login-providers{display:grid;gap:16px}.login-provider{min-height:54px;display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:10px;text-decoration:none;font-weight:700;transition:transform 160ms ease,border-color 160ms ease,background 160ms ease}
.login-provider:hover{transform:translateY(-1px)}.login-provider-primary{color:#03121a;background:linear-gradient(135deg,#71f7d0,#70c7ff);box-shadow:0 18px 54px rgba(87,220,255,.28)}
.login-provider-secondary{color:rgba(238,246,255,.94);border:1px solid rgba(150,205,255,.18);background:rgba(9,18,33,.72)}
.login-provider-icon{width:22px;height:22px;display:inline-grid;place-items:center}.login-provider-icon svg,.login-provider-icon img{max-width:22px;max-height:22px}
.login-divider{display:flex;align-items:center;gap:12px;color:rgba(211,226,241,.46);font-size:12px}.login-divider:before,.login-divider:after{content:"";height:1px;flex:1;background:rgba(177,215,255,.13)}
.login-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.login-provider-empty{padding:14px;border:1px dashed rgba(168,217,255,.28);border-radius:10px;color:rgba(225,238,255,.7);background:rgba(8,17,31,.58)}
.login-footer{margin-top:20px;color:rgba(206,222,241,.46);font-size:12px}
@media (max-width:920px){.login-shell{padding:22px 18px 30px}.login-main{grid-template-columns:1fr;gap:24px;padding-top:34px}.login-hero{min-height:420px}.login-copy h1{font-size:clamp(40px,12vw,62px)}.login-signals{grid-template-columns:1fr}.login-panel{padding:24px}}
@media (max-width:560px){.login-status{display:none}.login-hero{min-height:auto;padding:54px 0 18px}.login-orbit{inset:0 -30% auto -28%;height:380px;opacity:.72}.login-node{display:none}.login-pulse{width:180px;height:180px;left:36%;top:30%}.login-copy h1{margin-top:18px;font-size:clamp(36px,9.5vw,40px);line-height:1.08}.login-copy p{font-size:15px;line-height:1.75}.login-signals{margin-top:26px}.login-provider-grid{grid-template-columns:1fr}}
`;
