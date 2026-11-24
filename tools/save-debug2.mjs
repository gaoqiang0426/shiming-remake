import { chromium } from 'playwright-core';
const EXE='C:/Users/阿强/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe';
const b=await chromium.launch({executablePath:EXE});
const p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.goto('http://127.0.0.1:8765/index.html');
await p.waitForFunction(()=>window.G);
await p.evaluate(()=>{ const st=G.newState(); st.coins=4321; G.saveGame('1',st); });
await p.reload();
await p.waitForFunction(()=>window.G&&window.G.ui);
const r=await p.evaluate(()=>{
  try{ G.ui.loadFromSlot('1'); return {ok:true, game:!!G.game, coins:G.game&&G.game.st.coins}; }
  catch(e){ return {ok:false, err:e.message, stack:(e.stack||'').split('\n').slice(0,4)}; }
});
console.log(JSON.stringify(r,null,1));
await b.close();
