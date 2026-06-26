// 登录页以内联 CSS 返回，目标是让未登录首屏具备类似 WebGL 官网的流动感。
// 这里不引入站内组件或外部脚本：认证页必须保持独立、轻量，并且不能影响 Unified Auth 的 OAuth 链路。
export const aiPmLoginPageStyles = `
:root{color-scheme:dark;font-family:Inter,"PingFang SC","Microsoft YaHei",Arial,sans-serif;background:#030712;color:#eef7ff}
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{overflow-x:hidden;background:#030712}
.login-shell{position:relative;min-height:100vh;padding:28px clamp(24px,4vw,72px);display:grid;grid-template-rows:auto 1fr;isolation:isolate;overflow:hidden;background:radial-gradient(circle at 18% 18%,rgba(49,181,196,.26),transparent 32%),radial-gradient(circle at 82% 28%,rgba(69,240,196,.19),transparent 30%),radial-gradient(circle at 54% 78%,rgba(80,128,255,.12),transparent 35%),linear-gradient(135deg,#07111f 0%,#030712 48%,#05130f 100%)}
.login-shell:before{content:"";position:absolute;inset:0;z-index:-3;background:linear-gradient(rgba(153,233,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(153,233,255,.045) 1px,transparent 1px);background-size:72px 72px;mask-image:radial-gradient(circle at 48% 52%,#000 0%,#000 46%,transparent 82%);pointer-events:none}
.login-shell:after{content:"";position:absolute;left:7%;right:7%;bottom:-13%;height:38%;z-index:-2;background:linear-gradient(rgba(108,239,225,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(108,239,225,.08) 1px,transparent 1px);background-size:64px 64px;transform:perspective(920px) rotateX(66deg);transform-origin:50% 100%;opacity:.68;pointer-events:none}
.login-orbit-canvas{position:absolute;inset:0;z-index:-1;width:100%;height:100%;opacity:.95;pointer-events:none}
.login-topbar{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:16px}
.login-brand{display:inline-flex;align-items:center;gap:12px;min-width:0}
.login-mark{width:44px;height:44px;border:1px solid rgba(131,235,255,.58);border-radius:14px;display:grid;place-items:center;color:#a7f8ff;background:linear-gradient(145deg,rgba(20,41,66,.92),rgba(27,196,171,.32));box-shadow:0 20px 70px rgba(54,226,255,.24),inset 0 1px 0 rgba(255,255,255,.14)}
.login-brand strong{display:block;font-size:15px;letter-spacing:0}.login-brand span{display:block;margin-top:3px;color:rgba(223,235,255,.64);font-size:12px}
.login-status{padding:8px 12px;border:1px solid rgba(151,221,255,.3);border-radius:999px;color:rgba(231,245,255,.84);background:rgba(5,12,24,.42);box-shadow:0 12px 36px rgba(0,0,0,.24);backdrop-filter:blur(18px);white-space:nowrap;font-size:12px}
.login-main{position:relative;z-index:2;width:min(1280px,100%);min-height:calc(100vh - 100px);margin:0 auto;display:grid;grid-template-columns:minmax(580px,1fr) minmax(380px,442px);align-items:center;gap:clamp(42px,7vw,112px);padding:24px 0 48px}
.login-hero{position:relative;min-height:620px;display:flex;align-items:flex-end}
.login-stage{position:absolute;inset:8% 0 20%;min-height:360px;pointer-events:none}
.login-stage-core{position:absolute;left:46%;top:43%;width:min(34vw,430px);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(100,247,223,.18) 0%,rgba(49,183,255,.08) 34%,transparent 67%);filter:drop-shadow(0 0 70px rgba(91,232,255,.24))}
.login-core-ring{position:absolute;inset:8%;border:1px solid rgba(128,244,232,.28);border-radius:50%;transform:rotateX(62deg) rotateZ(-14deg);box-shadow:0 0 48px rgba(79,239,224,.12)}
.login-core-ring-a{animation:loginRotateA 16s linear infinite}
.login-core-ring-b{inset:24%;border-color:rgba(116,175,255,.22);animation:loginRotateB 11s linear infinite}
.login-core-pulse{position:absolute;left:50%;top:50%;width:34%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#78f6de 0%,rgba(89,208,255,.34) 38%,transparent 70%);box-shadow:0 0 64px rgba(119,246,222,.36);animation:loginPulse 2.8s ease-in-out infinite}
.login-core-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 14px;border:1px solid rgba(153,236,255,.3);border-radius:999px;color:#eaffff;background:rgba(5,13,26,.54);font-size:13px;font-weight:900;box-shadow:0 18px 44px rgba(0,0,0,.28);backdrop-filter:blur(16px)}
.login-signal{position:absolute;width:214px;padding:14px 15px;border:1px solid rgba(147,224,255,.23);border-radius:14px;color:rgba(238,248,255,.94);background:linear-gradient(180deg,rgba(9,24,43,.78),rgba(5,13,25,.56));box-shadow:0 24px 80px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.1);backdrop-filter:blur(18px);animation:loginFloat 6s ease-in-out infinite}
.login-signal:before{content:"";position:absolute;right:14px;top:14px;width:8px;height:8px;border-radius:50%;background:#68f3d5;box-shadow:0 0 18px #68f3d5}
.login-signal strong{display:block;font-size:14px}.login-signal span{display:block;margin-top:7px;color:rgba(214,232,247,.62);font-size:12px;line-height:1.55}
.login-signal-left{left:7%;top:31%}.login-signal-right{right:8%;top:23%;animation-delay:-2.1s}
.login-terminal{position:absolute;left:34%;bottom:5%;width:min(34vw,360px);padding:16px;border:1px solid rgba(128,219,255,.18);border-radius:18px;background:rgba(4,10,19,.58);box-shadow:0 22px 76px rgba(0,0,0,.34);backdrop-filter:blur(16px)}
.login-terminal span{display:block;height:8px;margin:10px 0;border-radius:999px;background:linear-gradient(90deg,rgba(103,245,220,.9),rgba(109,190,255,.42),transparent)}
.login-terminal span:nth-child(2){width:72%;animation:loginWidth 4s ease-in-out infinite}.login-terminal span:nth-child(3){width:48%;animation:loginWidth 4s ease-in-out -1.1s infinite}
.login-copy{position:relative;z-index:2;max-width:650px;padding-bottom:24px}
.login-kicker{display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(118,245,218,.34);border-radius:999px;color:#87f8df;background:rgba(5,22,30,.58);box-shadow:0 14px 42px rgba(57,255,208,.12);font-size:12px;font-weight:800}
.login-kicker:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 18px currentColor}
.login-copy h1{margin:22px 0 18px;max-width:720px;color:#fff;font-size:clamp(56px,5.8vw,88px);line-height:.98;letter-spacing:0;text-wrap:balance;text-shadow:0 26px 80px rgba(0,0,0,.68)}
.login-copy p{max-width:620px;margin:0;color:rgba(220,235,249,.78);font-size:17px;line-height:1.9;text-shadow:0 14px 44px rgba(0,0,0,.58)}
.login-flow{display:inline-flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:34px;padding:10px;border:1px solid rgba(148,215,255,.16);border-radius:18px;background:rgba(5,12,24,.44);box-shadow:0 18px 66px rgba(0,0,0,.26);backdrop-filter:blur(18px)}
.login-flow span{position:relative;min-width:58px;padding:10px 13px;border:1px solid rgba(149,222,255,.2);border-radius:11px;color:rgba(240,248,255,.94);background:linear-gradient(180deg,rgba(14,33,56,.84),rgba(7,18,33,.66));text-align:center;font-size:13px;font-weight:800}
.login-flow span:not(:last-child):after{content:"";position:absolute;right:-10px;top:50%;width:10px;height:1px;background:rgba(125,241,218,.68)}
.login-panel{position:relative;overflow:hidden;border:1px solid rgba(153,219,255,.26);border-radius:22px;padding:32px;background:linear-gradient(180deg,rgba(15,34,58,.88),rgba(4,10,21,.92));box-shadow:0 40px 120px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.11);backdrop-filter:blur(26px)}
.login-panel:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 16% 0%,rgba(101,255,213,.2),transparent 30%),radial-gradient(circle at 92% 12%,rgba(100,196,255,.2),transparent 28%),linear-gradient(90deg,rgba(255,255,255,.075),transparent 32%)}
.login-panel:after{content:"";position:absolute;left:26px;right:26px;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(126,244,225,.8),transparent)}
.login-panel>*{position:relative;z-index:1}.login-panel-kicker{color:#7af8df;font-size:12px;font-weight:900}
.login-panel h2{margin:12px 0 10px;color:#fff;font-size:30px;line-height:1.18;letter-spacing:0}.login-panel p{margin:0 0 22px;color:rgba(218,232,247,.68);font-size:14px;line-height:1.7}
.login-error{margin:0 0 16px;padding:12px 14px;border:1px solid rgba(255,92,120,.45);border-radius:10px;color:#ffd5dc;background:rgba(96,20,34,.45)}
.login-providers{display:grid;gap:16px}.login-provider{min-height:54px;display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:11px;text-decoration:none;font-weight:900;transition:transform 160ms ease,border-color 160ms ease,background 160ms ease,box-shadow 160ms ease}
.login-provider:hover{transform:translateY(-1px)}.login-provider-primary{color:#021018;background:linear-gradient(135deg,#70f0d0,#70ccff);box-shadow:0 20px 58px rgba(87,220,255,.32)}
.login-provider-primary:hover{box-shadow:0 24px 70px rgba(87,220,255,.42)}.login-provider-secondary{color:rgba(238,246,255,.95);border:1px solid rgba(150,205,255,.23);background:rgba(7,16,30,.78)}
.login-provider-icon{width:22px;height:22px;display:inline-grid;place-items:center}.login-provider-icon svg,.login-provider-icon img{max-width:22px;max-height:22px}
.login-divider{display:flex;align-items:center;gap:12px;color:rgba(211,226,241,.5);font-size:12px}.login-divider:before,.login-divider:after{content:"";height:1px;flex:1;background:rgba(177,215,255,.16)}
.login-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.login-provider-empty{padding:14px;border:1px dashed rgba(168,217,255,.3);border-radius:10px;color:rgba(225,238,255,.72);background:rgba(8,17,31,.6)}
.login-footer{margin-top:20px;color:rgba(206,222,241,.5);font-size:12px}
@keyframes loginRotateA{to{transform:rotateX(62deg) rotateZ(346deg)}}@keyframes loginRotateB{to{transform:rotateX(62deg) rotateZ(-374deg)}}@keyframes loginPulse{0%,100%{opacity:.72;transform:translate(-50%,-50%) scale(.94)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.06)}}@keyframes loginFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-14px,0)}}@keyframes loginWidth{0%,100%{width:54%;opacity:.68}50%{width:92%;opacity:1}}
@media (prefers-reduced-motion:reduce){.login-core-ring,.login-core-pulse,.login-signal,.login-terminal span{animation:none}}
@media (max-width:1080px){.login-main{grid-template-columns:1fr;gap:34px;min-height:auto;padding:44px 0 36px}.login-hero{min-height:560px}.login-copy{max-width:760px}.login-panel{max-width:560px;width:100%;justify-self:center}.login-stage{inset:2% 0 19%}.login-signal-left{left:2%}.login-signal-right{right:2%}}
@media (max-width:700px){.login-shell{padding:20px 18px 28px}.login-status{display:none}.login-main{padding:38px 0 28px;gap:28px}.login-hero{min-height:auto;display:block}.login-stage{position:relative;inset:auto;height:250px;margin:8px 0 22px}.login-stage-core{left:50%;top:49%;width:280px}.login-signal{width:172px;padding:12px}.login-signal-left{left:0;top:14%}.login-signal-right{right:0;top:36%}.login-terminal{left:18%;bottom:0;width:72%;padding:12px}.login-copy{padding-bottom:0}.login-copy h1{font-size:clamp(42px,12vw,56px);line-height:1.04}.login-copy p{font-size:15px;line-height:1.75}.login-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;gap:8px}.login-flow span{min-width:0;padding:9px 8px}.login-flow span:after{display:none}.login-panel{padding:24px;border-radius:18px}.login-panel h2{font-size:28px}.login-provider-grid{grid-template-columns:1fr}}
`;
