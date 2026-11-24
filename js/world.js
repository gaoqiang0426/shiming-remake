/* 使命 · 安卓复刻 — 世界构建：30 张场景的地形/碰撞/NPC/刷怪点/出口 */
(function () {
  'use strict';
  const G = window.G;

  const DIRS = ['west', 'east', 'north', 'south'];
  const GATE_LOCK = {
    'm01>north': { q: 'q06', msg: '完成草原主线后才能前往雪原。' },
    'm02>north': { q: 'q12', msg: '完成雪原主线后才能前往沙漠。' },
    'm03>north': { q: 'q18', msg: '完成沙漠主线后才能前往熔岩地区。' },
    'm27>east': { q: 'q23', msg: '四件宝物全部放置后，通道才会开启。' }
  };

  G.buildWorld = function (mapId, st) {
    const m = G.MAP[mapId];
    const region = G.REGION[m.region] || G.REGION.region_1;
    const w = {
      id: mapId, def: m, region, kind: m.kind,
      w: G.WORLD_W, h: G.WORLD_H,
      solids: [], decor: [], npcs: [], inter: [], gates: [],
      seed: m.seed, boss: null
    };
    const rnd = G.rng(m.seed * 7919 + 17);

    if (m.kind === 'town') layoutTown(w, rnd, st);
    else if (m.kind === 'passage') layoutPassage(w, rnd, st);
    else layoutField(w, rnd, st);

    // NPC
    Object.keys(G.NPC).forEach(id => {
      const n = G.NPC[id];
      if (n.map !== mapId) return;
      const p = { x: G.px(n.x), y: G.py(n.y) };
      if (w.solids.some(s => G.hitSolid(s, p.x, p.y, 22))) {
        p.y += 70;
      }
      w.npcs.push({ id, x: p.x, y: p.y, baseY: p.y, t: rnd() * 6 });
    });

    // 交互物（营救 / 神坛）
    m.inter.forEach(i => {
      w.inter.push({
        id: i.id, kind: i.kind, x: G.px(i.x), y: G.py(i.y),
        item: i.item, npc: i.npc, flag: i.flag
      });
    });

    // 出口
    DIRS.forEach(dir => {
      const target = m.exits[dir];
      if (!target) return;
      const lock = GATE_LOCK[mapId + '>' + dir];
      const cx = dir === 'west' ? 46 : dir === 'east' ? w.w - 46 : w.w / 2;
      const cy = dir === 'north' ? 46 : dir === 'south' ? w.h - 46 : w.h / 2;
      w.gates.push({
        dir, target, x: cx, y: cy,
        lockQuest: lock ? lock.q : '',
        lockMsg: lock ? lock.msg : '',
        name: G.T(G.MAP[target].nameKey)
      });
    });
    return w;
  };

  /* ---------- 地形：野外 ---------- */
  function layoutField(w, rnd, st) {
    const W = w.w, H = w.h;
    // 主通路：横向走廊，保证从西到东可通行
    const corridorY = H / 2;
    const free = (x, y, r) => {
      if (Math.abs(y - corridorY) < 105 + r) return false;
      for (let i = 0; i < w.gates.length; i++) {
        const g = w.gates[i];
        if (G.dist({ x, y }, { x: g.x, y: g.y }) < 120) return false;
      }
      return true;
    };
    // 岩石/树木
    const n = 26 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      const x = 90 + rnd() * (W - 180), y = 90 + rnd() * (H - 180);
      const r = 20 + rnd() * 26;
      if (!free(x, y, r)) continue;
      let ok = true;
      for (const s of w.solids) {
        if (G.dist({ x, y }, s) < r + s.r + 46) { ok = false; break; }
      }
      if (!ok) continue;
      const isTree = w.region.name !== '沙漠' && w.region.name !== '熔岩' ? rnd() > 0.35 : false;
      w.solids.push({ type: 'circle', x, y, r, art: isTree ? 'tree' : 'rock', seed: rnd() });
    }
    // 装饰
    const dn = 230;
    for (let i = 0; i < dn; i++) {
      const x = rnd() * W, y = rnd() * H;
      w.decor.push({ x, y, s: 0.6 + rnd() * 0.9, kind: pickDecor(w.region.name, rnd), rot: rnd() * 6.28 });
    }
    // 草丛 / 石堆成簇，避免整屏单一
    for (let c = 0; c < 34; c++) {
      const cx = 60 + rnd() * (W - 120), cy = 60 + rnd() * (H - 120);
      const kind = pickDecor(w.region.name, rnd);
      for (let k = 0; k < 6; k++) {
        w.decor.push({
          x: cx + (rnd() - 0.5) * 90, y: cy + (rnd() - 0.5) * 70,
          s: 0.55 + rnd() * 0.8, kind, rot: rnd() * 6.28
        });
      }
    }
    // 路边碎石
    for (let x = 40; x < W; x += 46) {
      if (rnd() > 0.55) w.decor.push({ x: x + rnd() * 20, y: corridorY - 108 - rnd() * 14, s: 0.5 + rnd() * 0.5, kind: 'pebble', rot: rnd() * 6.28 });
      if (rnd() > 0.55) w.decor.push({ x: x + rnd() * 20, y: corridorY + 108 + rnd() * 14, s: 0.5 + rnd() * 0.5, kind: 'pebble', rot: rnd() * 6.28 });
    }
    // 刷怪点
    w.def.spawns.forEach(sp => {
      const cx = G.px(sp.x), cy = G.py(sp.y);
      for (let i = 0; i < sp.count; i++) {
        const ang = rnd() * 6.283, rad = sp.boss ? 0 : 40 + rnd() * 150;
        const pos = { x: G.clamp(cx + Math.cos(ang) * rad, 70, W - 70), y: G.clamp(cy + Math.sin(ang) * rad, 70, H - 70) };
        w.spawns = w.spawns || [];
        w.spawns.push({ spawnId: sp.id, enemy: sp.enemy, level: sp.level, boss: sp.boss, respawn: sp.respawn, x: pos.x, y: pos.y });
      }
    });
  }

  /* ---------- 地形：城镇 ---------- */
  function layoutTown(w, rnd, st) {
    const W = w.w, H = w.h;
    // 广场
    w.plaza = { x: W / 2, y: H / 2 + 40, r: 210 };
    // 建筑（尺寸贴近角色比例，避免占满屏幕）
    const spots = [
      { x: W / 2 - 430, y: H / 2 - 190, w: 170, h: 120 },
      { x: W / 2 + 250, y: H / 2 - 210, w: 190, h: 130 },
      { x: W / 2 - 450, y: H / 2 + 150, w: 165, h: 115 },
      { x: W / 2 + 245, y: H / 2 + 140, w: 175, h: 120 },
      { x: W / 2 - 120, y: H / 2 - 330, w: 200, h: 125 },
      { x: W / 2 - 250, y: H / 2 + 300, w: 150, h: 105 }
    ];
    spots.forEach((s, i) => {
      w.solids.push({ type: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, art: 'house', seed: rnd(), idx: i });
    });
    w.decor.push({ x: W / 2, y: H / 2 + 40, kind: 'fountain', s: 1, rot: 0 });
    for (let i = 0; i < 46; i++) {
      const x = 60 + rnd() * (W - 120), y = 60 + rnd() * (H - 120);
      if (w.solids.some(s => G.hitSolid(s, x, y, 16))) continue;
      w.decor.push({ x, y, s: 0.6 + rnd() * 0.7, kind: pickDecor(w.region.name, rnd), rot: rnd() * 6.28 });
    }
    // 镇内无怪
    w.def.spawns.forEach(sp => {
      const cx = G.px(sp.x), cy = G.py(sp.y);
      for (let i = 0; i < sp.count; i++) {
        w.spawns = w.spawns || [];
        w.spawns.push({ spawnId: sp.id, enemy: sp.enemy, level: sp.level, boss: sp.boss, respawn: sp.respawn, x: cx + i * 30, y: cy });
      }
    });
  }

  /* ---------- 地形：终局通道 ---------- */
  function layoutPassage(w, rnd, st) {
    const W = w.w, H = w.h;
    const top = H / 2 - 170, bot = H / 2 + 170;
    for (let x = 120; x < W - 120; x += 150) {
      w.solids.push({ type: 'rect', x, y: 40, w: 120, h: top - 40, art: 'wall', seed: rnd() });
      w.solids.push({ type: 'rect', x, y: bot, w: 120, h: H - bot - 40, art: 'wall', seed: rnd() });
    }
    for (let i = 0; i < 40; i++) {
      w.decor.push({ x: rnd() * W, y: top + 10 + rnd() * (bot - top - 20), s: 0.6 + rnd(), kind: 'ember', rot: rnd() * 6.28 });
    }
    w.def.spawns.forEach(sp => {
      const cx = G.px(sp.x), cy = G.py(sp.y);
      for (let i = 0; i < sp.count; i++) {
        w.spawns = w.spawns || [];
        const ang = rnd() * 6.283, rad = 40 + rnd() * 190;
        w.spawns.push({
          spawnId: sp.id, enemy: sp.enemy, level: sp.level, boss: sp.boss, respawn: sp.respawn,
          x: G.clamp(cx + Math.cos(ang) * rad, 120, W - 120),
          y: G.clamp(cy + Math.sin(ang) * rad, top + 40, bot - 40)
        });
      }
    });
  }

  function pickDecor(region, rnd) {
    const t = rnd();
    if (region === '雪原') return t > 0.7 ? 'pine' : t > 0.35 ? 'snowmound' : 'icecrack';
    if (region === '沙漠') return t > 0.75 ? 'cactus' : t > 0.4 ? 'dune' : 'bones';
    if (region === '熔岩') return t > 0.6 ? 'crack' : t > 0.3 ? 'ember' : 'skull';
    return t > 0.72 ? 'flower' : t > 0.3 ? 'tuft' : 'pebble';
  }

  /* ---------- 碰撞 ---------- */
  G.hitSolid = function (s, x, y, r) {
    if (s.type === 'circle') return Math.hypot(x - s.x, y - s.y) < s.r + r;
    const cx = G.clamp(x, s.x, s.x + s.w), cy = G.clamp(y, s.y, s.y + s.h);
    return Math.hypot(x - cx, y - cy) < r;
  };

  G.resolve = function (w, x, y, r) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const s of w.solids) {
        if (s.type === 'circle') {
          const dx = x - s.x, dy = y - s.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const min = s.r + r;
          if (d < min) {
            const k = (min - d) / d;
            x += dx * k; y += dy * k; moved = true;
          }
        } else {
          const cx = G.clamp(x, s.x, s.x + s.w), cy = G.clamp(y, s.y, s.y + s.h);
          const dx = x - cx, dy = y - cy;
          const d = Math.hypot(dx, dy);
          if (d < r) {
            if (d > 0.001) {
              const k = (r - d) / d;
              x += dx * k; y += dy * k;
            } else {
              // 进入矩形内部：推向最近边
              const l = x - s.x, rr = s.x + s.w - x, t = y - s.y, b = s.y + s.h - y;
              const min = Math.min(l, rr, t, b);
              if (min === l) x = s.x - r;
              else if (min === rr) x = s.x + s.w + r;
              else if (min === t) y = s.y - r;
              else y = s.y + s.h + r;
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return { x: G.clamp(x, r, w.w - r), y: G.clamp(y, r, w.h - r) };
  };

  /* ---------- 出口判定 ---------- */
  G.gateAt = function (w, x, y) {
    for (const g of w.gates) {
      const near = g.dir === 'west' ? x < 34 : g.dir === 'east' ? x > w.w - 34 :
        g.dir === 'north' ? y < 34 : y > w.h - 34;
      if (!near) continue;
      const along = (g.dir === 'west' || g.dir === 'east') ? Math.abs(y - w.h / 2) < 150 : Math.abs(x - w.w / 2) < 190;
      if (along) return g;
    }
    return null;
  };

  G.entryPos = function (w, fromDir) {
    // 从 A 图走向东，进入 B 图时应在西侧
    const map = { west: 'east', east: 'west', north: 'south', south: 'north' };
    const d = map[fromDir] || 'west';
    if (d === 'west') return { x: 74, y: w.h / 2, facing: 0 };
    if (d === 'east') return { x: w.w - 74, y: w.h / 2, facing: Math.PI };
    if (d === 'north') return { x: w.w / 2, y: 74, facing: Math.PI / 2 };
    return { x: w.w / 2, y: w.h - 74, facing: -Math.PI / 2 };
  };
})();
