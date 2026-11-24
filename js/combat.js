/* 使命 · 安卓复刻 — 战斗层：角色/敌人/技能/掉落/任务结算 */
(function () {
  'use strict';
  const G = window.G;

  G.game = null;

  G.startGame = function (st, opts) {
    opts = opts || {};
    G.buffs = [];
    const g = G.game = {
      st,
      world: null,
      player: {
        x: 0, y: 0, r: 15, facing: 0, vx: 0, vy: 0,
        hp: st.hp, qi: st.qi, atkCd: 0, skillCd: {},
        invuln: 0, flash: 0, moving: false, step: 0,
        attackAnim: 0, castAnim: 0
      },
      enemies: [], projectiles: [], fx: [], pickups: [], texts: [],
      cam: { x: 0, y: 0, shake: 0 },
      nearest: null, paused: false, dead: false,
      lastAuto: 0, travelCd: 0, message: '', messageT: 0
    };
    G.enterMap(st.map, null, opts.pos);
    return g;
  };

  /* ---------- 进入地图 ---------- */
  G.enterMap = function (mapId, fromDir, pos) {
    const g = G.game, st = g.st;
    st.map = mapId;
    g.world = G.buildWorld(mapId, st);
    g.enemies = []; g.projectiles = []; g.fx = []; g.pickups = []; g.texts = [];
    g.world.spawns = g.world.spawns || [];
    g.world.spawns.forEach(sp => g.enemies.push(makeEnemy(sp, st)));
    g.world.boss = g.enemies.find(e => e.boss) || null;

    let p;
    if (pos) p = pos;
    else if (fromDir) p = G.entryPos(g.world, fromDir);
    else if (g.world.gates.some(gt => gt.dir === 'west')) p = { x: 90, y: g.world.h / 2, facing: 0 };
    else if (g.world.kind === 'town') p = { x: g.world.w / 2, y: g.world.h / 2 + 170, facing: 0 };
    else p = { x: g.world.w / 2, y: g.world.h / 2 + 60, facing: 0 };

    const r = G.resolve(g.world, p.x, p.y, g.player.r);
    g.player.x = r.x; g.player.y = r.y; g.player.facing = p.facing || 0;
    g.cam.x = r.x; g.cam.y = r.y;
    g.travelCd = 380;
    st.x = r.x; st.y = r.y;
    G.notify('进入 ' + G.T(g.world.def.nameKey), 'map');
    if (g.world.boss) G.sfx('boss');
    if (g.world.boss && g.world.boss.alive) G.notify('警告：' + G.T(G.ENEMY[g.world.boss.baseId].name) + ' 就在附近', 'warn');
  };

  /* ---------- 敌人 ---------- */
  function makeEnemy(sp, st) {
    const base = G.ENEMY[sp.enemy];
    const dl = Math.max(0, sp.level - base.level);
    const bossMul = sp.boss ? 2.6 : 1;
    const hp = Math.round(base.hp * (1 + 0.24 * dl) * bossMul);
    return {
      spawnId: sp.spawnId, baseId: sp.enemy, level: sp.level, boss: sp.boss,
      x: sp.x, y: sp.y, homeX: sp.x, homeY: sp.y, r: sp.boss ? 26 : 16,
      hp, maxHp: hp,
      atk: base.atk * (1 + 0.17 * dl) * (sp.boss ? 1.3 : 1),
      def: base.def * (1 + 0.14 * dl) * (sp.boss ? 1.25 : 1),
      speed: base.speed * (sp.boss ? 0.82 : 1) * (0.9 + Math.random() * 0.2),
      aggro: base.aggro, leash: base.leash, range: base.range || 60,
      xp: base.xp, coins: base.coins, drops: base.drops, ab: base.ab,
      state: 'idle', t: Math.random() * 3, cd: 800 + Math.random() * 900,
      windup: 0, flash: 0, alive: true, hurtT: 0, wander: { x: sp.x, y: sp.y },
      phase: 0, aoeT: 3000 + Math.random() * 2000, telegraph: null
    };
  }

  G.enemyName = e => G.T(G.ENEMY[e.baseId].name);

  /* ---------- 主更新 ---------- */
  G.update = function (dt) {
    const g = G.game;
    if (!g || g.paused || g.dead) return;
    const st = g.st, p = g.player;
    st.playTime += dt;

    updatePlayer(dt);
    g.enemies.forEach(e => updateEnemy(e, dt));
    updateProjectiles(dt);
    updateFx(dt);
    updatePickups(dt);

    g.enemies = g.enemies.filter(e => e.alive || e.deathT > 0);
    g.enemies.forEach(e => { if (!e.alive) e.deathT -= dt; });

    // 最近敌人
    let best = null, bd = 1e9;
    g.enemies.forEach(e => {
      if (!e.alive) return;
      const d = G.dist(p, e);
      if (d < bd) { bd = d; best = e; }
    });
    g.nearest = bd < 420 ? best : null;

    // 自动存档
    g.lastAuto += dt;
    if (g.lastAuto > 45000) { g.lastAuto = 0; G.saveGame('auto', st); }

    // 普通怪补充（可刷怪练级，Boss 不重生）
    g.respawnT = (g.respawnT || 0) + dt;
    if (g.respawnT > 11) {
      g.respawnT = 0;
      const pool = (g.world.spawns || []).filter(s => s.respawn && !s.boss);
      const target = pool.reduce((sum, p) => sum + p.count, 0);
      const alive = g.enemies.filter(e => e.alive && !e.boss).length;
      if (pool.length && alive < target * 0.6) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        for (let i = 0; i < 10; i++) {
          const x = G.clamp(pick.x + G.rand(-180, 180), 60, g.world.w - 60);
          const y = G.clamp(pick.y + G.rand(-140, 140), 60, g.world.h - 60);
          if (G.dist({ x, y }, p) > 460 && !G.hitSolidIn(g.world, x, y)) {
            g.enemies.push(makeEnemy({ ...pick, x, y }, st));
            break;
          }
        }
      }
    }

    // 自动完成类任务
    G.QUESTS.forEach(q => {
      if (q.mode !== 'auto') return;
      if (G.qState(st, q.id) !== 'active') return;
      if (G.qReady(st, q)) finishQuest(q, true);
    });
  };

  /* ---------- 玩家 ---------- */
  function updatePlayer(dt) {
    const g = G.game, st = g.st, p = g.player;
    const S = G.stats(st);
    if (p.hp > S.maxHp) p.hp = S.maxHp;
    if (p.qi > S.maxQi) p.qi = S.maxQi;
    p.qi = Math.min(S.maxQi, p.qi + 2.2 * dt);

    const inp = G.input || { mx: 0, my: 0 };
    let mx = inp.mx, my = inp.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    p.moving = len > 0.12;
    const spd = S.spd;
    if (p.moving) {
      p.facing = Math.atan2(my, mx);
      const r = G.resolve(g.world, p.x + mx * spd * dt, p.y + my * spd * dt, p.r);
      p.x = r.x; p.y = r.y;
      p.step += dt * (6 + spd * 0.02);
    }
    st.x = p.x; st.y = p.y;

    p.atkCd = Math.max(0, p.atkCd - dt * 1000);
    p.invuln = Math.max(0, p.invuln - dt * 1000);
    p.flash = Math.max(0, p.flash - dt * 1000);
    p.attackAnim = Math.max(0, p.attackAnim - dt * 1000);
    p.castAnim = Math.max(0, p.castAnim - dt * 1000);
    Object.keys(p.skillCd).forEach(k => { p.skillCd[k] = Math.max(0, p.skillCd[k] - dt * 1000); });

    // 出口
    g.travelCd = Math.max(0, g.travelCd - dt);
    if (g.travelCd <= 0) {
      const gate = G.gateAt(g.world, p.x, p.y);
      if (gate) tryGate(gate);
    }
    // 摄像机
    g.cam.x = G.lerp(g.cam.x, p.x, Math.min(1, dt * 8));
    g.cam.y = G.lerp(g.cam.y, p.y, Math.min(1, dt * 8));
    g.cam.shake = Math.max(0, g.cam.shake - dt * 30);
  }

  function tryGate(gate) {
    const st = G.game.st;
    if (gate.lockQuest && G.qState(st, gate.lockQuest) !== 'completed') {
      G.notify(gate.lockMsg, 'warn');
      // 推回
      const p = G.game.player;
      if (gate.dir === 'west') p.x += 40;
      if (gate.dir === 'east') p.x -= 40;
      if (gate.dir === 'north') p.y += 40;
      if (gate.dir === 'south') p.y -= 40;
      G.game.travelCd = 900;
      return;
    }
    G.saveGame('auto', st);
    G.enterMap(gate.target, gate.dir, null);
  }

  G.aimAngle = function () {
    const g = G.game, p = g.player;
    if (g.nearest && G.dist(p, g.nearest) < 260) {
      return Math.atan2(g.nearest.y - p.y, g.nearest.x - p.x);
    }
    return p.facing;
  };

  /* ---------- 普攻 ---------- */
  G.playerAttack = function () {
    const g = G.game, p = g.player, st = g.st;
    if (p.atkCd > 0) return;
    const S = G.stats(st);
    p.atkCd = 400;
    p.attackAnim = 260;
    p.facing = G.aimAngle();
    G.sfx('hit');
    let hitAny = false;
    g.enemies.forEach(e => {
      if (!e.alive) return;
      const d = G.dist(p, e);
      if (d > 78 + e.r) return;
      const ang = Math.atan2(e.y - p.y, e.x - p.x);
      let diff = Math.abs(((ang - p.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > 1.1) return;
      hitAny = true;
      const crit = Math.random() < S.crit;
      const dmg = (S.atk * 1.0) * (1 - e.def / (e.def + 110)) * (crit ? S.critMul : 1);
      hitEnemy(e, dmg, crit, '#ffe9b0');
    });
    g.fx.push({ kind: 'slash', x: p.x, y: p.y, a: p.facing, t: 0, dur: 200, r: 74 });
    if (!hitAny) { /* 挥空 */ }
  };

  /* ---------- 技能 ---------- */
  G.castSkill = function (idx) {
    const g = G.game, st = g.st, p = g.player;
    const id = st.equipped[idx];
    if (!id) { G.notify('技能槽 ' + (idx + 1) + ' 为空，去「技能」页装备', 'warn'); return; }
    if (!(st.skillLv[id] > 0)) { G.notify('尚未学习该技能', 'warn'); return; }
    const sd = G.skillDef(st, id);
    const S = G.stats(st);
    if ((p.skillCd[id] || 0) > 0) return;
    if (p.qi < sd.cost) { G.notify('灵气不足', 'warn'); return; }
    p.qi -= sd.cost;
    p.skillCd[id] = sd.cd;
    p.castAnim = 300;
    const aim = G.aimAngle();
    p.facing = aim;
    G.sfx('skill');
    const eff = sd.effects[0];
    const power = (S.atk * (eff.power_coefficient || 1) + (eff.base_power || 0)) *
      (['holy', 'fire', 'lightning'].includes(eff.damage_type) ? S.magic : 1);
    const skill = G.SKILL[id];
    const range = sd.range || 240;

    if (skill.delivery === 'projectile') {
      const shape = sd.shape;
      if (shape && shape.type === 'line') {
        // 直线贯穿
        const len = shape.length || 560;
        g.enemies.forEach(e => {
          if (!e.alive) return;
          if (inLine(p, e, aim, len, (shape.radius || 45) + e.r)) {
            hitEnemy(e, power * (1 - e.def / (e.def + 120)), false, '#ffb262');
          }
        });
        g.fx.push({ kind: 'beam', x: p.x, y: p.y, a: aim, len, t: 0, dur: 280, color: '#ff8a3c' });
      } else {
        g.projectiles.push({
          x: p.x, y: p.y, vx: Math.cos(aim) * (sd.speed || 600), vy: Math.sin(aim) * (sd.speed || 600),
          r: 9, dmg: power, life: 1.1, color: '#ffd479', from: 'player'
        });
      }
    } else if (skill.delivery === 'area' || skill.delivery === 'self') {
      const shape = sd.shape || { type: 'circle', radius: 180 };
      let cx = p.x, cy = p.y, rad = shape.radius || 180;
      if (shape.type === 'cone') {
        rad = shape.length || shape.radius || 300;
        g.enemies.forEach(e => {
          if (!e.alive) return;
          const d = G.dist(p, e);
          if (d > rad + e.r) return;
          const ang = Math.atan2(e.y - p.y, e.x - p.x);
          let diff = Math.abs(((ang - aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff > ((shape.angle_deg || 60) * Math.PI / 180) / 2) return;
          hitEnemy(e, power * (1 - e.def / (e.def + 120)), false, '#ffe9a8');
        });
        g.fx.push({ kind: 'cone', x: p.x, y: p.y, a: aim, len: rad, angle: (shape.angle_deg || 60) * Math.PI / 180, t: 0, dur: 320 });
      } else {
        if (skill.delivery === 'area') {
          const tgt = aimPoint(range);
          cx = tgt.x; cy = tgt.y;
          g.fx.push({ kind: 'telegraph', x: cx, y: cy, r: rad, t: 0, dur: 200, color: '#ffd166', instant: true });
        }
        g.enemies.forEach(e => {
          if (!e.alive) return;
          if (G.dist({ x: cx, y: cy }, e) > rad + e.r) return;
          hitEnemy(e, power * (1 - e.def / (e.def + 120)), false, '#ffd166');
        });
        g.fx.push({ kind: 'ring', x: cx, y: cy, r0: rad * 0.2, r1: rad, t: 0, dur: 340, color: 'rgba(255,214,102,0.85)' });
        g.cam.shake = 6;
      }
    } else if (skill.delivery === 'target') {
      // 连锁闪电
      let src = { x: p.x, y: p.y };
      const used = new Set();
      const chain = skill.levels[0].maxTargets || 3;
      const n = Math.max(3, chain);
      const pts = [{ x: p.x, y: p.y }];
      for (let i = 0; i < n; i++) {
        let best = null, bd = 340;
        g.enemies.forEach(e => {
          if (!e.alive || used.has(e)) return;
          const d = G.dist(src, e);
          if (d < bd) { bd = d; best = e; }
        });
        if (!best) break;
        used.add(best);
        hitEnemy(best, power * (1 - best.def / (best.def + 120)), false, '#9fe3ff');
        pts.push({ x: best.x, y: best.y });
        src = best;
      }
      g.fx.push({ kind: 'bolt', pts, t: 0, dur: 260 });
    }

    // 非伤害效果
    sd.effects.forEach(e => {
      if (e.type === 'heal') {
        const amt = (eff.base_power || 45) * (1 + st.attr.int * 0.01);
        p.hp = Math.min(S.maxHp, p.hp + amt);
        addText(p.x, p.y - 30, '+' + Math.round(amt), '#8ef58e');
        g.fx.push({ kind: 'ring', x: p.x, y: p.y, r0: 10, r1: 70, t: 0, dur: 420, color: 'rgba(140,245,140,0.7)' });
      } else if (e.type === 'shield') {
        const amt = (eff.base_power || 70) * (1 + st.attr.int * 0.01);
        p.shield = { amount: amt, until: G.now() + (eff.duration_ms || 8000) };
        addText(p.x, p.y - 30, '护盾 ' + Math.round(amt), '#a8d8ff');
      } else if (e.type === 'apply_status') {
        const mod = e.status.modifiers && e.status.modifiers[0];
        if (mod) {
          G.buffs.push({ stat: mod.stat, mul: mod.value, until: G.now() + (e.status.duration_ms || 8000) });
          addText(p.x, p.y - 30, '攻击提升', '#ffd166');
        }
      }
    });
  };

  function aimPoint(range) {
    const g = G.game, p = g.player;
    let tgt = null, bd = range + 120;
    g.enemies.forEach(e => {
      if (!e.alive) return;
      const d = G.dist(p, e);
      if (d < bd) { bd = d; tgt = e; }
    });
    if (tgt) return { x: tgt.x, y: tgt.y };
    const a = p.facing;
    return { x: p.x + Math.cos(a) * Math.min(range, 200), y: p.y + Math.sin(a) * Math.min(range, 200) };
  }

  function inLine(p, e, aim, len, width) {
    const dx = e.x - p.x, dy = e.y - p.y;
    const t = dx * Math.cos(aim) + dy * Math.sin(aim);
    if (t < 0 || t > len) return false;
    const perp = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
    return perp < width;
  }

  /* ---------- 敌人 AI ---------- */
  function updateEnemy(e, dt) {
    const g = G.game, p = g.player, st = g.st;
    if (!e.alive) { e.deathT -= 0; return; }
    e.flash = Math.max(0, e.flash - dt * 1000);
    e.t += dt;
    const d = G.dist(p, e);
    if (e.hurtT > 0) { e.hurtT -= dt * 1000; }
    if (e.windup > 0) {
      e.windup -= dt * 1000;
      if (e.windup <= 0) enemyStrike(e);
    }

    // Boss 范围技
    if (e.boss) {
      e.aoeT -= dt * 1000;
      if (e.telegraph) {
        e.telegraph.t += dt * 1000;
        if (e.telegraph.t >= e.telegraph.dur) {
          const tg = e.telegraph;
          if (G.dist(p, tg) < tg.r + 12) {
            damagePlayer(e.atk * 1.6, e);
            g.cam.shake = 12;
          }
          g.fx.push({ kind: 'ring', x: tg.x, y: tg.y, r0: tg.r * 0.4, r1: tg.r, t: 0, dur: 300, color: 'rgba(255,120,60,0.9)' });
          e.telegraph = null;
        }
      } else if (e.aoeT <= 0 && d < 340) {
        e.aoeT = 5200;
        e.telegraph = { x: p.x, y: p.y, r: 105, t: 0, dur: 950 };
      }
    }

    if (e.state === 'idle') {
      if (d < e.aggro) { e.state = 'chase'; }
      else {
        // 游荡
        if (G.dist(e, e.wander) < 12 || e.t > 2.4) {
          e.t = 0;
          const rad = G.ENEMY[e.baseId].patrol || 100;
          e.wander = { x: e.homeX + (Math.random() - 0.5) * rad * 2, y: e.homeY + (Math.random() - 0.5) * rad * 2 };
        }
        const a = Math.atan2(e.wander.y - e.y, e.wander.x - e.x);
        const r = G.resolve(g.world, e.x + Math.cos(a) * e.speed * 0.32 * dt, e.y + Math.sin(a) * e.speed * 0.32 * dt, e.r);
        e.x = r.x; e.y = r.y;
      }
    } else if (e.state === 'chase') {
      if (G.dist(e, { x: e.homeX, y: e.homeY }) > e.leash) { e.state = 'return'; }
      else if (d <= e.range + 6 && e.windup <= 0 && e.cd <= 0) {
        e.state = 'attack';
        e.windup = (e.ab[0] && e.ab[0].cast) || 320;
        e.cd = (e.ab[0] && e.ab[0].cd) || 1200;
        e.atkAngle = Math.atan2(p.y - e.y, p.x - e.x);
      } else {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        const r = G.resolve(g.world, e.x + Math.cos(a) * e.speed * dt, e.y + Math.sin(a) * e.speed * dt, e.r);
        e.x = r.x; e.y = r.y;
      }
      e.cd = Math.max(0, e.cd - dt * 1000);
    } else if (e.state === 'return') {
      const a = Math.atan2(e.homeY - e.y, e.homeX - e.x);
      if (G.dist(e, { x: e.homeX, y: e.homeY }) < 20) { e.state = 'idle'; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3); }
      else {
        const r = G.resolve(g.world, e.x + Math.cos(a) * e.speed * 0.7 * dt, e.y + Math.sin(a) * e.speed * 0.7 * dt, e.r);
        e.x = r.x; e.y = r.y;
      }
    } else if (e.state === 'attack') {
      if (e.windup <= 0) e.state = 'chase';
    }
  }

  function enemyStrike(e) {
    const g = G.game, p = g.player;
    e.state = 'chase';
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    const reach = (e.ab[0] && e.ab[0].range) || e.range || 60;
    if (G.dist(e, p) < reach + p.r + 10) {
      const diff = Math.abs(((a - e.atkAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < 1.4) damagePlayer(e.atk, e);
    }
    g.fx.push({ kind: 'slash', x: e.x, y: e.y, a, t: 0, dur: 180, r: reach, color: e.boss ? 'rgba(255,120,80,0.75)' : 'rgba(255,220,180,0.55)' });
  }

  /* ---------- 伤害 ---------- */
  function hitEnemy(e, dmg, crit, color) {
    if (!e.alive) return;
    const g = G.game;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 130;
    e.hurtT = 90;
    addText(e.x + G.rand(-10, 10), e.y - e.r - 8, (crit ? '暴击 ' : '') + dmg, crit ? '#ff7a5c' : (color || '#fff'));
    if (e.hp <= 0) killEnemy(e);
  }
  G.hitEnemy = hitEnemy;

  function damagePlayer(raw, src) {
    const g = G.game, p = g.player, st = g.st;
    if (p.invuln > 0 || g.dead) return;
    const S = G.stats(st);
    let dmg = raw * (1 - S.def / (S.def + 150));
    dmg = Math.max(1, Math.round(dmg));
    if (p.shield && p.shield.until > G.now() && p.shield.amount > 0) {
      const absorb = Math.min(p.shield.amount, dmg);
      p.shield.amount -= absorb;
      dmg -= absorb;
    }
    p.hp -= dmg;
    p.flash = 160;
    p.invuln = 320;
    g.cam.shake = 8;
    G.sfx('hurt');
    addText(p.x, p.y - 34, '-' + dmg, '#ff8080');
    if (p.hp <= 0) playerDie();
  }
  G.damagePlayer = damagePlayer;

  function playerDie() {
    const g = G.game, st = g.st;
    g.dead = true;
    st.deaths++;
    g.player.hp = 0;
    G.saveGame('auto', st);
    G.ui.showDeath();
  }

  G.respawn = function () {
    const g = G.game, st = g.st;
    const S = G.stats(st);
    g.player.hp = S.maxHp; g.player.qi = S.maxQi; g.player.shield = null;
    g.dead = false;
    G.enterMap('m01', null, null);
    G.ui.hideAll();
  };

  /* ---------- 击杀与掉落 ---------- */
  function killEnemy(e) {
    const g = G.game, st = g.st;
    e.alive = false;
    e.deathT = 700;
    st.kills++;
    G.sfx('hit');
    g.fx.push({ kind: 'ring', x: e.x, y: e.y, r0: 4, r1: e.r + 26, t: 0, dur: 300, color: 'rgba(255,255,255,0.6)' });
    for (let i = 0; i < 8; i++) {
      g.fx.push({
        kind: 'particle', x: e.x, y: e.y,
        vx: G.rand(-90, 90), vy: G.rand(-120, 40), t: 0, dur: 500,
        color: e.boss ? '#ff9a5a' : '#d8c9a6', s: G.rand(2, 4)
      });
    }
    G.gainXp(st, e.xp);
    const coins = Math.floor(G.rand(e.coins[0], e.coins[1] + 1)) * (e.boss ? 6 : 1);
    if (coins > 0) g.pickups.push({ x: e.x, y: e.y, kind: 'coin', n: coins, t: 0, vy: -60, life: 30 });
    e.drops.forEach(d => {
      if (Math.random() < d.chance) {
        for (let i = 0; i < d.min; i++) {
          g.pickups.push({ x: e.x + G.rand(-14, 14), y: e.y + G.rand(-14, 14), kind: 'item', item: d.item, n: 1, t: 0, vy: -50, life: 40 });
        }
      }
    });

    // 任务目标
    G.QUESTS.forEach(q => {
      const rec = st.quests[q.id];
      if (!rec || rec.state !== 'active') return;
      q.objectives.forEach(o => {
        if (o.type !== 'kill' || o.target !== e.baseId) return;
        if (o.spawns && o.spawns.length && !o.spawns.includes(e.spawnId)) return;
        rec.prog[o.id] = Math.min(o.count, (rec.prog[o.id] || 0) + 1);
      });
    });

    // Boss 掉落任务物品（不要求任务已接取，避免先清怪导致卡任务）
    if (e.boss) {
      G.QUESTS.forEach(q => {
        if (q.map !== g.world.id) return;
        q.objectives.forEach(o => {
          if (o.type !== 'collect') return;
          if (st.flags['got_' + o.target]) return;
          if (G.bagCount(st, o.target) > 0) return;
          st.flags['got_' + o.target] = 1;
          G.bagAdd(st, o.target, o.count);
          G.notify('获得任务物品：' + G.T(G.ITEM[o.target].name), 'item');
        });
      });
      G.saveGame('auto', st);
      // q24 的收尾交给任务状态机（自动完成 → 结局），保证统计里 24/24
    }
    G.ui.dirty = true;
  }

  /* ---------- 投射物 / 特效 / 掉落物 ---------- */
  function updateProjectiles(dt) {
    const g = G.game;
    g.projectiles.forEach(pr => {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      g.enemies.forEach(e => {
        if (!e.alive || pr.dead) return;
        if (G.hitSolidIn(g.world, pr.x, pr.y)) { pr.dead = true; return; }
        if (G.dist(pr, e) < e.r + pr.r) {
          hitEnemy(e, pr.dmg * (1 - e.def / (e.def + 120)), false, '#ffe9b0');
          pr.dead = true;
        }
      });
      if (pr.life <= 0) pr.dead = true;
      if (G.hitSolidIn(g.world, pr.x, pr.y)) pr.dead = true;
    });
    g.projectiles = g.projectiles.filter(p => !p.dead);
  }

  G.hitSolidIn = (w, x, y) => w.solids.some(s => G.hitSolid(s, x, y, 2));

  function updateFx(dt) {
    const g = G.game;
    g.fx.forEach(f => { f.t += dt * 1000; });
    g.fx = g.fx.filter(f => f.t < f.dur);
    g.texts.forEach(t => { t.t += dt * 1000; t.y -= dt * 26; });
    g.texts = g.texts.filter(t => t.t < t.dur);
  }
  G.updateFx = updateFx;

  function addText(x, y, text, color) {
    G.game.texts.push({ x, y, text, color, t: 0, dur: 850 });
  }
  G.addText = addText;

  function updatePickups(dt) {
    const g = G.game, p = g.player, st = g.st;
    g.pickups.forEach(pk => {
      pk.t += dt; pk.life -= dt;
      pk.y += (pk.vy || 0) * dt;
      pk.vy = (pk.vy || 0) * 0.92;
      const d = G.dist(p, pk);
      if (d < 90) {
        const a = Math.atan2(p.y - pk.y, p.x - pk.x);
        const pull = d < 40 ? 320 : 120;
        pk.x += Math.cos(a) * pull * dt; pk.y += Math.sin(a) * pull * dt;
      }
      if (d < 26) {
        if (pk.kind === 'coin') {
          st.coins += pk.n;
          G.sfx('coin');
          addText(p.x, p.y - 40, '+' + pk.n + ' 金', '#ffd166');
        } else {
          G.bagAdd(st, pk.item, pk.n);
          G.notify('获得 ' + G.T(G.ITEM[pk.item].name) + ' ×' + pk.n, 'item');
        }
        pk.dead = true;
        G.ui.dirty = true;
      }
      if (pk.life <= 0) pk.dead = true;
    });
    g.pickups = g.pickups.filter(k => !k.dead);
  }

  /* ---------- 道具使用 ---------- */
  G.usePotion = function (sub) {
    const g = G.game, st = g.st, p = g.player;
    const S = G.stats(st);
    const cand = st.bag.filter(b => {
      const d = G.ITEM[b.id];
      return d && d.type === 'consumable' && d.sub === sub;
    });
    if (!cand.length) { G.notify(sub === 'red_potion' ? '没有红药' : '没有蓝药', 'warn'); return; }
    const pick = cand.sort((a, b) => (G.ITEM[a.id].use[0].amount || 0) - (G.ITEM[b.id].use[0].amount || 0))[0];
    const def = G.ITEM[pick.id];
    const eff = def.use[0];
    if (sub === 'red_potion') {
      if (p.hp >= S.maxHp) { G.notify('生命已满', 'warn'); return; }
      p.hp = Math.min(S.maxHp, p.hp + eff.amount);
      addText(p.x, p.y - 34, '+' + eff.amount, '#8ef58e');
    } else {
      if (p.qi >= S.maxQi) { G.notify('灵气已满', 'warn'); return; }
      p.qi = Math.min(S.maxQi, p.qi + eff.amount);
      addText(p.x, p.y - 34, '+' + eff.amount + ' 灵气', '#8ec8ff');
    }
    G.bagRemove(st, pick.id, 1);
    G.ui.dirty = true;
    G.sfx('ui');
  };

  /* ---------- 交互 ---------- */
  G.nearInteract = function () {
    const g = G.game, p = g.player;
    let best = null, bd = 74;
    g.world.npcs.forEach(n => {
      const d = G.dist(p, n);
      if (d < bd) { bd = d; best = { type: 'npc', ref: n }; }
    });
    g.world.inter.forEach(i => {
      const d = G.dist(p, i);
      if (d < bd) { bd = d; best = { type: 'inter', ref: i }; }
    });
    return best;
  };

  G.interact = function () {
    const g = G.game, st = g.st;
    const near = G.nearInteract();
    if (!near) { G.notify('附近没有可交互目标', 'warn'); return; }
    if (near.type === 'npc') return talkTo(near.ref);
    const i = near.ref;
    if (i.kind === 'rescue') {
      const npc = G.NPC[i.npc];
      st.flags['rescue_' + i.id] = 1;
      st.flags[i.flag] = 1;
      G.notify('已解救 ' + G.T(npc.name), 'quest');
      G.ui.showDialog({
        name: G.T(npc.name),
        text: npcLine(i.npc, 'default') || '谢谢你救了我。',
        actions: [{ label: '好', act: 'close' }]
      });
      G.saveGame('auto', st);
      G.ui.dirty = true;
      return;
    }
    if (i.kind === 'place') {
      if (st.flags['place_' + i.id]) { G.notify('此处宝物已放置', 'warn'); return; }
      if (G.bagCount(st, i.item) < 1) { G.notify('缺少：' + G.T(G.ITEM[i.item].name), 'warn'); return; }
      st.flags['place_' + i.id] = 1;
      G.notify('已放置 ' + G.T(G.ITEM[i.item].name), 'quest');
      G.sfx('level');
      G.ui.dirty = true;
      G.saveGame('auto', st);
      g.fx.push({ kind: 'ring', x: i.x, y: i.y, r0: 10, r1: 120, t: 0, dur: 700, color: 'rgba(120,220,255,0.8)' });
      return;
    }
  };

  /* NPC 默认台词：本地化键规则为 dlg_<短id>_default */
  function npcLine(npcId, suffix) {
    const short = String(npcId || '').replace(/^npc_/, '');
    const key = 'dlg_' + short + '_' + (suffix || 'default');
    return (window.S && window.S[key]) || '';
  }

  function talkTo(n) {
    const g = G.game, st = g.st;
    const npc = G.NPC[n.id];
    // 被围困者：交谈即视为解救
    if (npc.rescue && !st.flags['rescue_' + n.id]) {
      st.flags['rescue_' + n.id] = 1;
      g.world.inter.forEach(i => {
        if (i.npc === n.id) { st.flags['rescue_' + i.id] = 1; if (i.flag) st.flags[i.flag] = 1; }
      });
      G.notify('已解救 ' + G.T(npc.name), 'quest');
      G.sfx('level');
      G.ui.dirty = true;
      G.saveGame('auto', st);
    }
    const name = G.T(npc.name);
    const cls = npcLine(n.id, 'default');
    const lines = [cls || '……'];
    // 任务
    const myQuests = G.QUESTS.filter(q =>
      (q.turnIn === n.id || npc.quests.includes(q.id)) && q.map !== '' || npc.quests.includes(q.id)
    );
    const avail = myQuests.filter(q => G.qAvailable(st, q));
    const active = myQuests.filter(q => G.qState(st, q.id) === 'active');
    const ready = active.filter(q => G.qReady(st, q));
    const actions = [];
    ready.forEach(q => actions.push({
      label: '交付：' + G.T(q.title), act: 'turnin', q, tone: 'gold'
    }));
    avail.forEach(q => actions.push({
      label: '接取：' + G.T(q.title), act: 'accept', q, tone: 'gold'
    }));
    if (npc.shop) actions.push({ label: '交易：' + G.T(G.SHOP[npc.shop].name), act: 'shop', shop: npc.shop });
    active.forEach(q => {
      if (ready.includes(q)) return;
      lines.push('【' + G.T(q.title) + '】' + G.T(q.desc) + '　' + G.objectiveText(st, q));
    });
    if (avail.length) lines.push('我这里有件事需要你去做。');
    G.ui.showDialog({
      name, text: lines.filter(Boolean).join('\n'),
      actions: actions.concat([{ label: '离开', act: 'close', tone: 'muted' }])
    });
  }
  G.talkTo = talkTo;

  /* ---------- 任务动作 ---------- */
  G.acceptQuest = function (q) {
    const st = G.game.st;
    if (G.qAccept(st, q)) {
      G.notify('接受任务：' + G.T(q.title), 'quest');
      G.saveGame('auto', st);
      G.ui.dirty = true;
    }
  };

  function finishQuest(q, auto) {
    const st = G.game.st;
    const rw = G.qComplete(st, q);
    G.notify('任务完成：' + G.T(q.title) + '（经验 +' + rw.xp + (rw.coins ? '，金币 +' + rw.coins : '') + '）', 'quest');
    G.sfx('level');
    G.saveGame('auto', st);
    G.ui.dirty = true;
    if (q.id === 'q24') G.victory();
  }
  G.turnInQuest = function (q) {
    const st = G.game.st;
    if (!G.qReady(st, q)) return;
    finishQuest(q, false);
    const nxt = G.QUESTS.filter(x => (x.prereq || []).includes(q.id));
    if (nxt.length) G.notify('新任务可接取：' + G.T(nxt[0].title), 'quest');
  };

  /* ---------- 结局 ---------- */
  G.victory = function () {
    const st = G.game.st;
    if (st.cleared) return;
    st.cleared = true;
    G.saveGame('auto', st);
    G.game.paused = true;
    G.ui.showVictory();
  };
})();
