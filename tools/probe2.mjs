import { chromium } from 'playwright-core';
const EXE='C:/Users/阿强/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe';
const b=await chromium.launch({executablePath:EXE});
const p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto('http://127.0.0.1:8765/index.html');
await p.waitForFunction(()=>window.G&&window.G.ui);
await p.getByText('开始新的使命').click();
await p.waitForTimeout(500);
const info=await p.evaluate(()=>{
  const el=document.elementsFromPoint(810,370)[0];
  return {tag:el.tagName, html:el.outerHTML.slice(0,400), rect:JSON.stringify(el.getBoundingClientRect()),
          cs:JSON.stringify({bg:getComputedStyle(el).background, w:getComputedStyle(el).width, z:getComputedStyle(el).zIndex, pos:getComputedStyle(el).position})};
});
console.log(JSON.stringify(info,null,1));
await b.close();
