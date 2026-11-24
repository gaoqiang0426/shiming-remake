import { chromium } from 'playwright-core';
const EXE='C:/Users/阿强/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe';
const b=await chromium.launch({executablePath:EXE});
const p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto('http://127.0.0.1:8765/index.html');
await p.waitForFunction(()=>window.G&&window.G.ui);
await p.getByText('开始新的使命').click();
await p.waitForFunction(()=>window.G.game);
await p.waitForTimeout(400);
const regions=[['m12','20-snow'],['m18','21-desert'],['m24','22-lava'],['m27','23-altar']];
for(const [id,name] of regions){
  await p.evaluate((id)=>{ G.enterMap(id,null,null); G.noticeBox=0; const st=G.game.st; st.level=20; },id);
  await p.waitForTimeout(500);
  await p.screenshot({path:'shots/'+name+'.png'});
}
// 竖屏检查
const p2=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p2.goto('http://127.0.0.1:8765/index.html');
await p2.waitForFunction(()=>window.G&&window.G.ui);
await p2.getByText('开始新的使命').click();
await p2.waitForTimeout(500);
await p2.screenshot({path:'shots/24-portrait.png'});
console.log('done');
await b.close();
