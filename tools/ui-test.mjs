// 界面交互测试：对话框 / 商店购买 / 触控施法 / 存档读档
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/阿强/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:8765/index.html';

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL);
await page.waitForFunction(() => window.G && window.G.ui);
await page.getByText('开始新的使命').click();
await page.waitForFunction(() => window.G.game);
await page.waitForTimeout(400);

// 1. 走到药剂商旁边，点交互
await page.evaluate(() => {
  const n = G.game.world.npcs.find(x => G.NPC[x.id].shop);
  G.game.player.x = n.x; G.game.player.y = n.y + 34;
  window.__npcId = n.id;
});
await page.waitForTimeout(260);
const actVisible = await page.locator('#btnAction').evaluate(el => el.classList.contains('show'));
await page.locator('#btnAction').click({ force: true });
await page.waitForTimeout(220);
const dlgText = await page.locator('.dlg-text').innerText().catch(() => '');
await page.screenshot({ path: 'shots/10-dialog.png' });

// 2. 进入商店并买一瓶小红药
const shopBtn = page.locator('#dialog .btn', { hasText: '交易' });
const hasShop = await shopBtn.count();
if (hasShop) await shopBtn.first().click({ force: true });
await page.waitForTimeout(260);
await page.screenshot({ path: 'shots/11-shop.png' });
const before = await page.evaluate(() => ({ coins: G.game.st.coins, potions: G.bagCount(G.game.st, 'item_red_potion_s') }));
const buyBtn = page.locator('.shop-row', { hasText: '小红药' }).locator('.btn');
if (await buyBtn.count()) await buyBtn.first().click({ force: true });
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({ coins: G.game.st.coins, potions: G.bagCount(G.game.st, 'item_red_potion_s') }));
await page.evaluate(() => { document.getElementById('panel').classList.remove('show'); G.game.paused = false; });

// 3. 触控施法：点技能 1 应扣灵气
const qiTest = await page.evaluate(() => { G.game.player.qi = 60; G.game.player.skillCd = {}; return G.game.player.qi; });
await page.locator('#sk0').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true });
await page.waitForTimeout(260);
const qiAfter = await page.evaluate(() => G.game.player.qi);

// 4. 存档 → 刷新 → 读档
await page.evaluate(() => {
  G.game.st.coins = 4321;
  G.saveGame('1', G.game.st);
});
await page.reload();
await page.waitForFunction(() => window.G && window.G.ui);
await page.getByText('存档管理').click();
await page.waitForTimeout(200);
const slotText = await page.locator('.slot').first().innerText().catch(() => '');
await page.locator('.slot', { hasText: '存档 1' }).locator('.btn', { hasText: '读取' }).click().catch(async () => { });
await page.waitForTimeout(500);
const loaded = await page.evaluate(() => (G.game ? G.game.st.coins : -1));

console.log('交互按钮出现=' + actVisible + '　对话长度=' + dlgText.length + '　商店可用=' + !!hasShop);
console.log('购买前 ' + JSON.stringify(before) + ' → 购买后 ' + JSON.stringify(after));
console.log('触控施法 灵气 ' + qiTest + ' → ' + qiAfter.toFixed(1));
console.log('存档读档 金币=' + loaded + '　（期望 4321）');
console.log(errors.length ? '运行时错误：\n' + errors.slice(0, 8).join('\n') : '运行时零错误');
await browser.close();
