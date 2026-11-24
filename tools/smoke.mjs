// 无头浏览器冒烟测试：真实浏览器里跑一遍主流程 + 24 条主线全通
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EXE = 'C:/Users/阿强/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe';
const URL = process.env.URL || 'http://127.0.0.1:8765/index.html';
const SHOTS = 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
});
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.G && window.G.ui);
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/01-title.png' });

await page.getByText('开始新的使命').click();
await page.waitForFunction(() => window.G.game);
await page.waitForTimeout(700);
await page.screenshot({ path: SHOTS + '/02-town.png' });

// 移动测试
const move = await page.evaluate(async () => {
  const p = G.game.player;
  const x0 = p.x, y0 = p.y;
  G.input.mx = 1; G.input.my = 0;
  await new Promise(r => setTimeout(r, 700));
  G.input.mx = 0;
  return { dx: p.x - x0, dy: p.y - y0 };
});
console.log('移动测试 dx=' + move.dx.toFixed(1) + ' dy=' + move.dy.toFixed(1));

// 面板测试
for (const [id, shot] of [['btnBag', '03-bag'], ['btnChar', '04-char'], ['btnMenu', '05-pause']]) {
  await page.click('#' + id);
  await page.waitForTimeout(240);
  await page.screenshot({ path: SHOTS + '/' + shot + '.png' });
  await page.evaluate(() => { document.getElementById('panel').classList.remove('show'); G.game.paused = false; });
}
await page.evaluate(() => G.ui.openPanel('skills'));
await page.waitForTimeout(240);
await page.screenshot({ path: SHOTS + '/06-skills.png' });
await page.evaluate(() => { document.getElementById('panel').classList.remove('show'); G.game.paused = false; });

// 野外 + 战斗
await page.evaluate(() => { G.enterMap('m05', null, null); });
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + '/07-field.png' });

// 打一场：给玩家一点属性，避免被秒
await page.evaluate(() => {
  const st = G.game.st;
  st.attr.con = 20; st.attr.str = 12; st.level = 6;
  G.game.player.hp = 999;
  G.playerAttack();
});
await page.waitForTimeout(900);
await page.screenshot({ path: SHOTS + '/08-combat.png' });

// 战斗逻辑验证：近战是否掉血、技能是否生成投射物
const combat = await page.evaluate(async () => {
  G.enterMap('m05', null, null);
  const g = G.game, p = g.player;
  const e = g.enemies.find(x => x.alive && !x.boss);
  p.x = e.x - 42; p.y = e.y;
  p.facing = 0;
  const hp0 = e.hp;
  for (let i = 0; i < 4; i++) { G.playerAttack(); p.atkCd = 0; }
  const melee = hp0 - e.hp;
  p.qi = 999;
  const before = g.projectiles.length;
  G.castSkill(0);
  const proj = g.projectiles.length - before;
  p.hp = 30;
  G.damagePlayer(50, e);
  const hurt = p.hp < 30;
  p.hp = 9999; g.dead = false;
  return { melee, proj, hurt, alive: e.alive };
});
console.log('战斗验证：近战伤害 ' + combat.melee + '　飞镖投射物 ' + combat.proj + '　受击扣血=' + combat.hurt);

// ---- 全流程通关 ----
const result = await page.evaluate(async () => {
  const log = [];
  const st = G.game.st;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function killAllOnMap(mapId) {
    G.game.enemies.forEach(e => { if (e.alive) G.hitEnemy(e, 999999); });
  }

  for (const q of G.QUESTS) {
    if (!st.quests[q.id]) {
      if (!G.qAvailable(st, q)) { log.push(q.id + ' 不可接取'); continue; }
      G.acceptQuest(q);
    }
    if (G.qState(st, q.id) === 'completed') { log.push(q.id + ' 已完成'); continue; }
    G.enterMap(q.map, null, null);
    G.game.player.hp = 99999;

    for (const o of q.objectives) {
      if (o.type === 'kill') {
        let guard = 0;
        while (guard++ < 8) {
          const cand = G.game.enemies.filter(e => e.alive && e.baseId === o.target);
          if (!cand.length) break;
          cand.forEach(e => G.hitEnemy(e, 999999));
        }
      } else if (o.type === 'collect') {
        // Boss 必掉；若没掉则补一条（模拟从容器取得）
        G.game.enemies.filter(e => e.alive && e.boss).forEach(e => G.hitEnemy(e, 999999));
        if (!G.bagCount(st, o.target) && !st.flags['got_' + o.target]) {
          st.flags['got_' + o.target] = 1;
          G.bagAdd(st, o.target, 1);
          log.push(q.id + ' 容器补发 ' + o.target);
        }
      } else if (o.type === 'rescue') {
        const npc = G.game.world.npcs.find(n => n.id === o.target);
        const it = G.game.world.inter.find(i => i.npc === o.target);
        const tgt = npc || it;
        if (tgt) {
          G.game.player.x = tgt.x; G.game.player.y = tgt.y + 30;
          G.interact();
          G.ui.closeDialog();
          G.game.paused = false;
        } else log.push(q.id + ' 找不到营救对象 ' + o.target);
      } else if (o.type === 'place') {
        const it = G.game.world.inter.find(i => i.id === o.target);
        if (it) {
          G.game.player.x = it.x; G.game.player.y = it.y + 30;
          G.interact();
        } else log.push(q.id + ' 找不到神坛 ' + o.target);
      }
    }

    if (q.mode === 'npc') {
      if (G.qReady(st, q)) G.turnInQuest(q);
      else log.push(q.id + ' 未达成：' + G.objectiveText(st, q));
    } else {
      G.game.paused = false;
      G.update(0.016);
      if (G.qState(st, q.id) !== 'completed') log.push(q.id + ' 自动完成失败：' + G.objectiveText(st, q));
    }
  }

  const done = G.QUESTS.filter(q => G.qState(st, q.id) === 'completed').length;
  return { done, total: G.QUESTS.length, level: st.level, cleared: st.cleared, log };
});
console.log('主线完成 ' + result.done + '/' + result.total +
  '　等级 ' + result.level + '　通关=' + result.cleared);
if (result.log.length) console.log('问题：\n' + result.log.join('\n'));

if (result.cleared) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + '/09-victory.png' });
}

// 地图遍历：确认 30 张图都能构建、可站立
const maps = await page.evaluate(() => {
  const bad = [];
  Object.keys(G.MAP).forEach(id => {
    try {
      G.enterMap(id, null, null);
      const w = G.game.world;
      const p = G.game.player;
      if (!w.solids) bad.push(id + ' 无地形');
      if (p.x < 0 || p.y < 0) bad.push(id + ' 出生点异常');
      if (!w.gates.length && w.def.kind !== 'town') bad.push(id + ' 无出口');
    } catch (e) { bad.push(id + ' 构建失败 ' + e.message); }
  });
  return bad;
});
console.log(maps.length ? '地图问题：\n' + maps.join('\n') : '30 张地图构建通过');

console.log(errors.length ? '运行时错误：\n' + errors.slice(0, 12).join('\n') : '运行时零错误');
await browser.close();
