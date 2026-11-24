/* 使命 · 安卓复刻 — 渲染层：程序化地形 / 角色 / 特效（不使用任何原版美术素材） */
(function () {
  'use strict';
  const G = window.G;

  const ARTS = {
    snake: { shape: 'snake', c1: '#4f9e46', c2: '#255028', eye: '#ffe14a' },
    raider: { shape: 'human', c1: '#a8543e', c2: '#6d3226', eye: '#ffd9b0' },
    wolf: { shape: 'beast', c1: '#9fb3c4', c2: '#5f7488', eye: '#ff7a5c' },
    imp: { shape: 'imp', c1: '#c74a2c', c2: '#71241a', eye: '#ffd166' },
    guard: { shape: 'human', c1: '#8a8f9c', c2: '#4d525e', eye: '#cfe6ff' },
    lord: { shape: 'demon', c1: '#5b1f3a', c2: '#2a0b1c', eye: '#ff3b3b' }
  };

  G.artOf = function (baseId) {
    const b = G.ENEMY[baseId];
    const id = baseId;
    if (id.indexOf('dark_lord') >= 0) return ARTS.lord;
    if (id.indexOf('snake') >= 0) return ARTS.snake;
    if (id.indexOf('wolf') >= 0 || id.indexOf('beast') >= 0) return ARTS.wolf;
    if (id.indexOf('imp') >= 0) return ARTS.imp;
    if (id.indexOf('raider') >= 0 || id.indexOf('seeker') >= 0 || id.indexOf('captain') >= 0 ||
      id.indexOf('general') >= 0 || id.indexOf('spy') >= 0 || id.indexOf('traitor') >= 0 ||
      id.indexOf('commander') >= 0) return ARTS.raider;
    return ARTS.guard;
  };

  G.R = {};

  G.R.init = function (canvas) {
    G.R.canvas = canvas;
    G.R.ctx = canvas.getContext('2d');
    G.R.resize();
    window.addEventListener('resize', () => G.R.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => G.R.resize(), 260));
  };

  G.R.resize = function () {
    const c = G.R.canvas;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    G.R.dpr = dpr; G.R.cw = w; G.R.ch = h;
  };

  /* ---------- 地形烘焙 ---------- */
  function bakeGround(world) {
    const cv = document.createElement('canvas');
    cv.width = world.w; cv.height = world.h;
    const c = cv.getContext('2d');
    const reg = world.region;
    const rnd = G.rng(world.seed * 31 + 7);

    c.fillStyle = reg.base;
    c.fillRect(0, 0, world.w, world.h);

    // 大色块（三种绿/沙/雪层次，柔边过渡）
    for (let i = 0; i < 160; i++) {
      const x = rnd() * world.w, y = rnd() * world.h, r = 60 + rnd() * 170;
      const col = [reg.alt, reg.edge, reg.base][Math.floor(rnd() * 3)];
      const g2 = c.createRadialGradient(x, y, 0, x, y, r);
      g2.addColorStop(0, hexA(col, 0.42));
      g2.addColorStop(0.65, hexA(col, 0.22));
      g2.addColorStop(1, hexA(col, 0));
      c.fillStyle = g2;
      c.beginPath();
      c.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 6.284);
      c.fill();
    }

    // 主路：不规则土路 + 压暗的路肩
    const roadY = world.h / 2;
    const band = (half, wob, phase) => {
      c.beginPath();
      for (let x = 0; x <= world.w; x += 24) {
        const y = roadY - half + Math.sin(x * 0.011 + phase) * wob;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      for (let x = world.w; x >= 0; x -= 24) {
        const y = roadY + half + Math.sin(x * 0.013 + phase + 2.1) * wob;
        c.lineTo(x, y);
      }
      c.closePath();
    };
    c.fillStyle = hexA(reg.edge, 0.45);
    band(116, 14, 0.6); c.fill();
    c.fillStyle = hexA(reg.road, 0.55);
    band(94, 17, 1.9); c.fill();
    c.fillStyle = hexA(reg.road, 0.28);
    band(66, 20, 3.4); c.fill();
    // 路面碎石
    for (let i = 0; i < 620; i++) {
      const x = rnd() * world.w, y = roadY - 92 + rnd() * 184;
      c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
      c.beginPath(); c.ellipse(x, y, 1.5 + rnd() * 3.5, 1 + rnd() * 2, rnd() * 3, 0, 6.284); c.fill();
    }

    // 竖向连接
    if (world.gates.some(g => g.dir === 'north' || g.dir === 'south')) {
      const gx = world.w / 2;
      const vband = (half, wob) => {
        c.beginPath();
        for (let y = 0; y <= world.h; y += 24) {
          const x = gx - half + Math.sin(y * 0.012 + 1.2) * wob;
          y ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        for (let y = world.h; y >= 0; y -= 24) {
          const x = gx + half + Math.sin(y * 0.014 + 3.3) * wob;
          c.lineTo(x, y);
        }
        c.closePath();
      };
      c.fillStyle = hexA(reg.edge, 0.3);
      vband(112, 12); c.fill();
      c.fillStyle = hexA(reg.road, 0.42);
      vband(86, 15); c.fill();
    }

    // 石砖感
    c.strokeStyle = 'rgba(0,0,0,0.06)';
    c.lineWidth = 1;
    for (let x = 0; x < world.w; x += 48) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, world.h); c.stroke();
    }
    for (let y = 0; y < world.h; y += 48) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(world.w, y); c.stroke();
    }

    // 细颗粒，打破大色块的塑料感
    for (let i = 0; i < 2200; i++) {
      const x = rnd() * world.w, y = rnd() * world.h;
      c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.06)';
      const s = 1 + rnd() * 2.4;
      c.fillRect(x, y, s, s);
    }
    // 大草簇阴影（增加层次）
    for (let i = 0; i < 60; i++) {
      const x = rnd() * world.w, y = rnd() * world.h, r = 30 + rnd() * 70;
      c.fillStyle = 'rgba(0,0,0,0.05)';
      c.beginPath(); c.ellipse(x, y, r, r * 0.55, rnd() * 3, 0, 6.284); c.fill();
    }
    // 地图边缘压暗
    const vg = c.createRadialGradient(world.w / 2, world.h / 2, Math.min(world.w, world.h) * 0.46,
      world.w / 2, world.h / 2, Math.max(world.w, world.h) * 0.64);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = vg;
    c.fillRect(0, 0, world.w, world.h);

    // 城镇石板广场
    if (world.plaza) {
      const pz = world.plaza;
      c.save();
      c.fillStyle = 'rgba(206,196,176,0.42)';
      c.beginPath(); c.ellipse(pz.x, pz.y, pz.r, pz.r * 0.74, 0, 0, 6.284); c.fill();
      // 石板缝
      c.strokeStyle = 'rgba(70,60,45,0.18)'; c.lineWidth = 1.4;
      for (let i = 1; i <= 5; i++) {
        c.beginPath(); c.ellipse(pz.x, pz.y, pz.r * i / 5.6, pz.r * 0.74 * i / 5.6, 0, 0, 6.284); c.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * 6.284;
        c.beginPath();
        c.moveTo(pz.x + Math.cos(a) * pz.r * 0.12, pz.y + Math.sin(a) * pz.r * 0.12 * 0.74);
        c.lineTo(pz.x + Math.cos(a) * pz.r, pz.y + Math.sin(a) * pz.r * 0.74);
        c.stroke();
      }
      // 碎石纹理
      for (let i = 0; i < 260; i++) {
        const a = rnd() * 6.284, rr = Math.sqrt(rnd()) * pz.r;
        const x = pz.x + Math.cos(a) * rr, y = pz.y + Math.sin(a) * rr * 0.74;
        c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,50,35,0.10)';
        c.fillRect(x, y, 2, 1.6);
      }
      c.strokeStyle = 'rgba(255,240,210,0.45)'; c.lineWidth = 6;
      c.beginPath(); c.ellipse(pz.x, pz.y, pz.r * 0.99, pz.r * 0.73, 0, 0, 6.284); c.stroke();
      // 广场四向短街
      c.fillStyle = 'rgba(206,196,176,0.3)';
      c.fillRect(pz.x - pz.r - 130, pz.y - 46, (pz.r + 130) * 2, 92);
      c.restore();
    }
    return cv;
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- 主绘制 ---------- */
  G.R.draw = function (dt) {
    const g = G.game;
    if (!g) return;
    const ctx = G.R.ctx, cw = G.R.cw, ch = G.R.ch, dpr = G.R.dpr;
    const world = g.world;
    if (!world._ground) world._ground = bakeGround(world);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const reg = world.region;
    ctx.fillStyle = reg.sky;
    ctx.fillRect(0, 0, cw, ch);

    const zoom = G.clamp(Math.min(cw, ch) / 430, 0.62, 1.5);
    G.R.zoom = zoom;
    // 摄像机限制在世界范围内，避免露出黑边
    const vw = cw / zoom, vh = ch / zoom;
    const camX = world.w > vw ? G.clamp(g.cam.x, vw / 2, world.w - vw / 2) : world.w / 2;
    const camY = world.h > vh ? G.clamp(g.cam.y, vh / 2, world.h - vh / 2) : world.h / 2;
    g.cam.cx = camX; g.cam.cy = camY;
    const shake = g.cam.shake;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;

    ctx.save();
    ctx.translate(cw / 2 + sx, ch / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    const view = {
      x: camX - cw / 2 / zoom, y: camY - ch / 2 / zoom,
      w: cw / zoom, h: ch / zoom
    };

    ctx.drawImage(world._ground, 0, 0);

    // 出口提示
    world.gates.forEach(gt => drawGate(ctx, world, gt, g));

    // 地面装饰
    world.decor.forEach(d => drawDecor(ctx, d, world));

    // 掉落
    g.pickups.forEach(pk => drawPickup(ctx, pk));

    // 深度排序
    const list = [];
    world.solids.forEach(s => list.push({ y: s.type === 'circle' ? s.y : s.y + s.h, kind: 'solid', s }));
    world.npcs.forEach(n => list.push({ y: n.y, kind: 'npc', n }));
    world.inter.forEach(i => list.push({ y: i.y, kind: 'inter', i }));
    g.enemies.forEach(e => { if (e.alive || e.deathT > 0) list.push({ y: e.y, kind: 'enemy', e }); });
    list.push({ y: g.player.y, kind: 'player' });
    list.sort((a, b) => a.y - b.y);

    list.forEach(item => {
      if (!inView(item, view)) return;
      if (item.kind === 'solid') drawSolid(ctx, item.s, world);
      else if (item.kind === 'npc') drawNpc(ctx, item.n, g);
      else if (item.kind === 'inter') drawInter(ctx, item.i, g);
      else if (item.kind === 'enemy') drawEnemy(ctx, item.e, g);
      else if (item.kind === 'player') drawPlayer(ctx, g);
    });

    drawFx(ctx, g);
    drawTexts(ctx, g);
    drawEdgeHints(ctx, world, g, view);

    ctx.restore();

    // 屏幕色调
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.32, cw / 2, ch / 2, Math.max(cw, ch) * 0.78);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    if (g.player.flash > 0) {
      ctx.fillStyle = 'rgba(255,60,40,' + (g.player.flash / 160 * 0.28) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
  };

  function inView(item, v) {
    const o = 140;
    return item.y > v.y - o && item.y < v.y + v.h + o;
  }

  /* ---------- 地形物件 ---------- */
  function drawSolid(ctx, s, world) {
    const rnd = G.rng(Math.floor((s.seed || 0.5) * 1e6) + 3);
    if (s.art === 'tree' || s.art === 'pine') {
      const h = s.r * 2.4;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, s.r * 0.5, s.r * 0.9, s.r * 0.4, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(-s.r * 0.16, -h * 0.2, s.r * 0.32, h * 0.7);
      const snow = world.region.name === '雪原';
      ctx.fillStyle = snow ? '#dbeaf4' : '#2f5c34';
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const w = s.r * (1.5 - i * 0.28), y = -h * 0.2 - i * h * 0.26;
        ctx.beginPath();
        ctx.moveTo(0, y - h * 0.36);
        ctx.lineTo(-w, y + h * 0.16);
        ctx.lineTo(w, y + h * 0.16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = snow ? 'rgba(255,255,255,0.55)' : 'rgba(190,220,140,0.35)';
      ctx.beginPath(); ctx.ellipse(-s.r * 0.2, -h * 0.62, s.r * 0.5, s.r * 0.22, -0.4, 0, 6.284); ctx.fill();
      ctx.restore();
      return;
    }
    if (s.art === 'rock') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(0, s.r * 0.45, s.r * 1.02, s.r * 0.42, 0, 0, 6.284); ctx.fill();
      const g1 = ctx.createLinearGradient(0, -s.r, 0, s.r);
      g1.addColorStop(0, '#9aa3ad'); g1.addColorStop(1, '#5c646e');
      ctx.fillStyle = g1;
      ctx.beginPath();
      const pts = 7;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * 6.284;
        const rr = s.r * (0.72 + rnd() * 0.34);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.8;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(-s.r * 0.22, -s.r * 0.3, s.r * 0.34, s.r * 0.2, -0.5, 0, 6.284); ctx.fill();
      ctx.restore();
      return;
    }
    if (s.art === 'house') {
      const { x, y, w, h } = s;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 6, w * 0.55, 18, 0, 0, 6.284); ctx.fill();
      // 墙
      const wall = ctx.createLinearGradient(x, y, x, y + h);
      wall.addColorStop(0, '#d8cbb2'); wall.addColorStop(1, '#a4917a');
      ctx.fillStyle = wall;
      ctx.fillRect(x, y + h * 0.34, w, h * 0.66);
      // 屋顶
      ctx.fillStyle = world.region.name === '雪原' ? '#c9dbe8' : '#7c4a3a';
      ctx.beginPath();
      ctx.moveTo(x - 18, y + h * 0.4);
      ctx.lineTo(x + w / 2, y - h * 0.16);
      ctx.lineTo(x + w + 18, y + h * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y - h * 0.16);
      ctx.lineTo(x + w + 18, y + h * 0.4);
      ctx.lineTo(x + w / 2, y + h * 0.4);
      ctx.closePath(); ctx.fill();
      // 门窗
      ctx.fillStyle = '#4a3a2c';
      ctx.fillRect(x + w / 2 - 20, y + h * 0.62, 40, h * 0.38);
      ctx.fillStyle = '#f7d98d';
      ctx.fillRect(x + w * 0.16, y + h * 0.5, 26, 26);
      ctx.fillRect(x + w * 0.72, y + h * 0.5, 26, 26);
      ctx.restore();
      return;
    }
    if (s.art === 'wall') {
      ctx.fillStyle = '#2a1c1f';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(226,98,44,0.28)';
      for (let i = 0; i < 5; i++) {
        const yy = s.y + (s.h / 5) * i + 8;
        ctx.fillRect(s.x + 6, yy, s.w - 12, 4);
      }
    }
  }

  function drawDecor(ctx, d, world) {
    const reg = world.region.name;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.globalAlpha = 0.9;
    if (d.kind === 'tuft') {
      const grassCol = reg === '雪原' ? 'rgba(232,243,250,0.72)' :
        reg === '沙漠' ? 'rgba(196,164,92,0.78)' :
          reg === '熔岩' ? 'rgba(120,70,52,0.85)' : 'rgba(140,190,96,0.8)';
      ctx.fillStyle = grassCol;
      const blades = 5;
      for (let i = 0; i < blades; i++) {
        const bx = (i - 2) * 3.1 * d.s;
        const hgt = (10 + ((i * 7) % 9)) * d.s;
        const lean = ((i % 3) - 1) * 3.2 * d.s;
        ctx.beginPath();
        ctx.moveTo(bx - 1.7 * d.s, 4);
        ctx.quadraticCurveTo(bx + lean * 0.5, 4 - hgt * 0.6, bx + lean, 4 - hgt);
        ctx.quadraticCurveTo(bx + lean * 0.5 + 1.4 * d.s, 4 - hgt * 0.55, bx + 1.7 * d.s, 4);
        ctx.closePath();
        ctx.fill();
      }
    } else if (d.kind === 'flower') {
      ctx.fillStyle = ['#f2d16b', '#e88a9a', '#cfe4ff'][Math.floor(d.s * 3) % 3];
      ctx.beginPath(); ctx.arc(0, 0, 3.2 * d.s, 0, 6.284); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(-1, -1, 1.2 * d.s, 0, 6.284); ctx.fill();
    } else if (d.kind === 'pebble') {
      ctx.fillStyle = 'rgba(120,120,110,0.55)';
      ctx.beginPath(); ctx.ellipse(0, 0, 4 * d.s, 2.6 * d.s, d.rot, 0, 6.284); ctx.fill();
    } else if (d.kind === 'pine') {
      ctx.fillStyle = '#2c4a38';
      ctx.beginPath(); ctx.moveTo(0, -18 * d.s); ctx.lineTo(-7 * d.s, 6 * d.s); ctx.lineTo(7 * d.s, 6 * d.s); ctx.closePath(); ctx.fill();
    } else if (d.kind === 'snowmound') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, 12 * d.s, 6 * d.s, 0, 0, 6.284); ctx.fill();
    } else if (d.kind === 'icecrack') {
      ctx.strokeStyle = 'rgba(140,200,240,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10 * d.s, 0); ctx.lineTo(0, -5 * d.s); ctx.lineTo(9 * d.s, 3 * d.s); ctx.stroke();
    } else if (d.kind === 'dune') {
      ctx.strokeStyle = 'rgba(160,125,70,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 4, 14 * d.s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else if (d.kind === 'cactus') {
      const w = 4.6 * d.s;
      ctx.strokeStyle = '#4a7c4a';
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 7 * d.s); ctx.lineTo(0, -15 * d.s); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8 * d.s, 2 * d.s);
      ctx.lineTo(-8 * d.s, -5 * d.s);
      ctx.quadraticCurveTo(-8 * d.s, -9 * d.s, -1.5 * d.s, -9 * d.s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8 * d.s, 4 * d.s);
      ctx.lineTo(8 * d.s, -3 * d.s);
      ctx.quadraticCurveTo(8 * d.s, -7 * d.s, 1.5 * d.s, -7 * d.s);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2 * d.s;
      ctx.beginPath(); ctx.moveTo(-1.4 * d.s, 5 * d.s); ctx.lineTo(-1.4 * d.s, -13 * d.s); ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (d.kind === 'bones') {
      ctx.strokeStyle = 'rgba(235,225,205,0.55)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-8 * d.s, 2); ctx.lineTo(8 * d.s, -3); ctx.stroke();
      ctx.beginPath(); ctx.arc(-9 * d.s, 2, 2, 0, 6.284); ctx.stroke();
      ctx.beginPath(); ctx.arc(9 * d.s, -3, 2, 0, 6.284); ctx.stroke();
    } else if (d.kind === 'crack') {
      ctx.strokeStyle = 'rgba(226,98,44,' + (0.35 + Math.sin(d.x * 0.05) * 0.2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(-2, -3); ctx.lineTo(6, 4); ctx.lineTo(15, -2); ctx.stroke();
    } else if (d.kind === 'ember') {
      const t = (G.now() / 900 + d.x * 0.01) % 1;
      ctx.globalAlpha = 0.35 + 0.4 * Math.sin(t * 6.28);
      ctx.fillStyle = '#ff9a4a';
      ctx.beginPath(); ctx.arc(0, 0, 2.4 * d.s, 0, 6.284); ctx.fill();
    } else if (d.kind === 'skull') {
      ctx.fillStyle = 'rgba(230,220,205,0.55)';
      ctx.beginPath(); ctx.arc(0, 0, 4.5 * d.s, 0, 6.284); ctx.fill();
      ctx.fillStyle = 'rgba(30,20,20,0.8)';
      ctx.beginPath(); ctx.arc(-1.6 * d.s, -0.6, 1.1 * d.s, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.arc(1.6 * d.s, -0.6, 1.1 * d.s, 0, 6.284); ctx.fill();
    } else if (d.kind === 'fountain') {
      ctx.fillStyle = 'rgba(190,215,230,0.6)';
      ctx.beginPath(); ctx.ellipse(0, 0, 74, 46, 0, 0, 6.284); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, 74, 46, 0, 0, 6.284); ctx.stroke();
      const t = G.now() / 600;
      ctx.fillStyle = 'rgba(200,235,255,0.75)';
      ctx.beginPath(); ctx.arc(0, -6 + Math.sin(t) * 3, 8, 0, 6.284); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 出口 ---------- */
  function drawGate(ctx, world, gt, g) {
    const locked = gt.lockQuest && G.qState(g.st, gt.lockQuest) !== 'completed';
    const horizontal = gt.dir === 'west' || gt.dir === 'east';
    const stone = locked ? '#6b4a44' : '#7a6a52';
    const glow = locked ? 'rgba(200,100,80,0.5)' : 'rgba(255,225,160,0.6)';
    ctx.save();
    ctx.translate(gt.x, gt.y);
    // 门拱：两根石柱 + 门槛光带
    if (horizontal) {
      [-104, 104].forEach(dy => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(0, dy + 16, 16, 7, 0, 0, 6.284); ctx.fill();
        ctx.fillStyle = stone;
        ctx.fillRect(-9, dy - 52, 18, 56);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(-9, dy - 52, 5, 56);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, dy - 56, 5, 0, 6.284); ctx.fill();
      });
      const grd = ctx.createLinearGradient(0, -104, 0, 104);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, glow);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(-3, -100, 6, 200);
    } else {
      [-132, 132].forEach(dx => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(dx, 16, 16, 7, 0, 0, 6.284); ctx.fill();
        ctx.fillStyle = stone;
        ctx.fillRect(dx - 9, -52, 18, 56);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(dx - 9, -52, 5, 56);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(dx, -56, 5, 0, 6.284); ctx.fill();
      });
      const grd = ctx.createLinearGradient(-132, 0, 132, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, glow);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(-128, -3, 256, 6);
    }
    ctx.restore();
  }

  function drawEdgeHints(ctx, world, g, view) {
    // 屏幕边缘方向提示
    const p = g.player;
    world.gates.forEach(gt => {
      const d = Math.hypot(gt.x - p.x, gt.y - p.y);
      if (d < 420) return;
      let sx = gt.x - p.x, sy = gt.y - p.y;
      const L = Math.hypot(sx, sy) || 1;
      const R = Math.min(view.w, view.h) * 0.42;
      ctx.save();
      ctx.translate(p.x + sx / L * R, p.y + sy / L * R);
      ctx.rotate(Math.atan2(sy, sx));
      ctx.fillStyle = 'rgba(255,235,180,0.55)';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }

  /* ---------- 玩家 ---------- */
  function drawPlayer(ctx, g) {
    const p = g.player;
    const bob = Math.sin(p.step * 2) * (p.moving ? 2.2 : 0.9);
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    // 主角标识环
    ctx.globalAlpha = 0.5 + Math.sin(G.now() / 700) * 0.14;
    ctx.strokeStyle = 'rgba(255,224,160,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 13, 21, 9.5, 0, 0, 6.284); ctx.stroke();
    ctx.globalAlpha = 1;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(0, 14, 15, 6, 0, 0, 6.284); ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2;
    // 披风
    const fx = Math.cos(p.facing) * 4, fy = Math.sin(p.facing) * 4;
    ctx.fillStyle = '#2f3f6b';
    ctx.beginPath();
    ctx.moveTo(-11 - fx * 0.4, -2 + fy * 0.4);
    ctx.quadraticCurveTo(-16 - fx, 16, -6, 15);
    ctx.lineTo(6, 15);
    ctx.quadraticCurveTo(16 - fx, 16, 11 - fx * 0.4, -2 + fy * 0.4);
    ctx.closePath(); ctx.fill();
    // 身体
    const bodyG = ctx.createLinearGradient(0, -12, 0, 14);
    bodyG.addColorStop(0, '#5f7fc4'); bodyG.addColorStop(1, '#3b4f8a');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.ellipse(0, 3, 10, 12, 0, 0, 6.284); ctx.fill();
    // 头
    ctx.fillStyle = '#f0cfae';
    ctx.beginPath(); ctx.arc(0, -11, 8.2, 0, 6.284); ctx.fill();
    // 头发
    ctx.fillStyle = '#3a2b22';
    ctx.beginPath(); ctx.arc(0, -13, 8.4, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    // 金饰
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(-6.4, -9, 2.1, 0, 6.284); ctx.fill();
    // 剑
    const swing = p.attackAnim > 0 ? (1 - p.attackAnim / 260) : 0;
    const ang = p.facing + (p.attackAnim > 0 ? -1.2 + swing * 2.2 : 0.55);
    const len = 30;
    ctx.save();
    ctx.rotate(ang);
    ctx.strokeStyle = p.attackAnim > 0 ? 'rgba(255,240,190,0.95)' : 'rgba(210,225,240,0.85)';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6 + len, 0); ctx.stroke();
    ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.restore();
    // 护盾
    if (p.shield && p.shield.until > G.now() && p.shield.amount > 0) {
      ctx.strokeStyle = 'rgba(150,210,255,0.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.284); ctx.stroke();
      ctx.fillStyle = 'rgba(140,200,255,0.14)';
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.284); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 敌人 ---------- */
  function drawEnemy(ctx, e, g) {
    if (!e.alive) {
      const k = 1 - e.deathT / 700;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      ctx.translate(e.x, e.y);
      ctx.scale(1, Math.max(0.15, k));
      ctx.fillStyle = 'rgba(40,30,30,0.6)';
      ctx.beginPath(); ctx.ellipse(0, 6, e.r, e.r * 0.5, 0, 0, 6.284); ctx.fill();
      ctx.restore();
      return;
    }
    const art = G.artOf(e.baseId);
    const S = e.r / 16;
    const bob = Math.sin(G.now() / 260 + e.x) * 2;
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, e.r * 0.85, e.r * 0.95, e.r * 0.4, 0, 0, 6.284); ctx.fill();
    // 与地面拉开明度差
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 3;

    if (e.flash > 0) ctx.globalAlpha = 0.96;

    if (art.shape === 'snake') {
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.ellipse(0, 4, 15 * S, 12 * S, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = art.c1;
      ctx.beginPath(); ctx.ellipse(-2, 2, 12 * S, 9.5 * S, 0, 0, 6.284); ctx.fill();
      [-7, 7].forEach((dx, i) => {
        ctx.fillStyle = art.c1;
        ctx.beginPath(); ctx.ellipse(dx * S, -9 * S, 6.5 * S, 6 * S, 0, 0, 6.284); ctx.fill();
        ctx.fillStyle = art.eye;
        ctx.beginPath(); ctx.arc(dx * S - 1.5, -10 * S, 1.7 * S, 0, 6.284); ctx.fill();
      });
    } else if (art.shape === 'beast') {
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.ellipse(0, 3, 16 * S, 11 * S, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = art.c1;
      ctx.beginPath(); ctx.ellipse(-1, 1, 13 * S, 9 * S, 0, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8 * S, -4 * S); ctx.lineTo(15 * S, -12 * S); ctx.lineTo(16 * S, -2 * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = art.eye;
      ctx.beginPath(); ctx.arc(9 * S, -7 * S, 1.8 * S, 0, 6.284); ctx.fill();
    } else if (art.shape === 'imp') {
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.ellipse(0, 4, 11 * S, 12 * S, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = art.c1;
      ctx.beginPath(); ctx.arc(0, -3 * S, 8 * S, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6 * S, -9 * S); ctx.lineTo(-9 * S, -16 * S); ctx.lineTo(-2 * S, -11 * S); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6 * S, -9 * S); ctx.lineTo(9 * S, -16 * S); ctx.lineTo(2 * S, -11 * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = art.eye;
      ctx.beginPath(); ctx.arc(-3 * S, -4 * S, 1.7 * S, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.arc(3 * S, -4 * S, 1.7 * S, 0, 6.284); ctx.fill();
    } else if (art.shape === 'demon') {
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.ellipse(0, 6, 20 * S, 16 * S, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = art.c1;
      ctx.beginPath(); ctx.ellipse(0, 0, 16 * S, 13 * S, 0, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10 * S, -10 * S); ctx.lineTo(-16 * S, -26 * S); ctx.lineTo(-2 * S, -13 * S); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10 * S, -10 * S); ctx.lineTo(16 * S, -26 * S); ctx.lineTo(2 * S, -13 * S); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(-5 * S, -4 * S, 2.6 * S, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.arc(5 * S, -4 * S, 2.6 * S, 0, 6.284); ctx.fill();
    } else {
      // human
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.ellipse(0, 5, 10 * S, 12 * S, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = art.c1;
      ctx.beginPath(); ctx.ellipse(0, 2, 8.5 * S, 10 * S, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#e8c6a4';
      ctx.beginPath(); ctx.arc(0, -9 * S, 6.4 * S, 0, 6.284); ctx.fill();
      ctx.fillStyle = art.c2;
      ctx.beginPath(); ctx.arc(0, -11 * S, 6.8 * S, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      // 武器
      ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.moveTo(7 * S, 0); ctx.lineTo(19 * S, -6 * S); ctx.stroke();
    }
    if (e.flash > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, e.r + 2, 0, 6.284); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 血条
    const showBar = e.boss || e.hp < e.maxHp;
    if (showBar) {
      const w = e.boss ? 90 : 34, h = e.boss ? 7 : 4;
      const y = e.y - e.r - (e.boss ? 30 : 20);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, y, w, h);
      ctx.fillStyle = e.boss ? '#ff6b4a' : '#e0533f';
      ctx.fillRect(e.x - w / 2, y, w * (e.hp / e.maxHp), h);
      if (e.boss) {
        ctx.font = '600 11px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,225,200,0.95)';
        ctx.fillText(G.enemyName(e) + ' Lv.' + e.level, e.x, y - 6);
      }
    }
    // 攻击预警
    if (e.windup > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.range + 12, 0, 6.284); ctx.stroke();
      ctx.restore();
    }
    // Boss 范围预警
    if (e.telegraph) {
      const t = e.telegraph;
      const k = Math.min(1, t.t / t.dur);
      ctx.save();
      ctx.fillStyle = 'rgba(255,90,40,0.18)';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.284); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,60,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.284); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,60,0.35)';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * k, 0, 6.284); ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- NPC / 交互物 ---------- */
  function drawNpc(ctx, n, g) {
    const def = G.NPC[n.id];
    const st = g.st;
    const bob = Math.sin(G.now() / 620 + n.t) * 1.6;
    ctx.save();
    ctx.translate(n.x, n.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 14, 12, 5, 0, 0, 6.284); ctx.fill();
    const isShop = !!def.shop;
    const rescued = def.rescue && st.flags['rescue_' + n.id];
    ctx.fillStyle = isShop ? '#4a7a6a' : '#4a5568';
    ctx.beginPath(); ctx.ellipse(0, 4, 9, 12, 0, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#efc9a6';
    ctx.beginPath(); ctx.arc(0, -9, 7.4, 0, 6.284); ctx.fill();
    ctx.fillStyle = def.rescue ? '#8a5a3a' : '#d8c8a8';
    ctx.beginPath(); ctx.arc(0, -11, 7.8, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    if (isShop) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(0, 2, 3, 0, 6.284); ctx.fill();
    }
    ctx.restore();

    // 名字与任务标记
    ctx.font = '600 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = G.T(def.name);
    const w = ctx.measureText(label).width;
    ctx.fillRect(n.x - w / 2 - 6, n.y + 18, w + 12, 16);
    ctx.fillStyle = '#f0e6d2';
    ctx.fillText(label, n.x, n.y + 30);

    // 标记
    const myQ = G.QUESTS.filter(q => (q.turnIn === n.id || def.quests.includes(q.id)));
    const ready = myQ.some(q => G.qReady(st, q) && q.mode !== 'auto');
    const avail = myQ.some(q => G.qAvailable(st, q));
    if (ready || avail) {
      const t = G.now() / 380;
      const yy = n.y - 30 + Math.sin(t) * 3;
      ctx.font = 'bold 18px system-ui,sans-serif';
      ctx.fillStyle = ready ? '#7ef2a1' : '#ffd166';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText(ready ? '?' : '!', n.x, yy);
      ctx.fillText(ready ? '?' : '!', n.x, yy);
    }
    if (isShop) {
      ctx.font = '11px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(255,209,102,0.9)';
      ctx.fillText('商', n.x + 18, n.y + 4);
    }
    if (rescued) {
      ctx.font = '11px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(140,245,160,0.9)';
      ctx.fillText('✓', n.x - 18, n.y + 4);
    }
  }

  function drawInter(ctx, i, g) {
    const st = g.st;
    const done = st.flags['place_' + i.id] || st.flags['rescue_' + i.id];
    ctx.save();
    ctx.translate(i.x, i.y);
    if (i.kind === 'place') {
      const t = G.now() / 700;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 12, 22, 8, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#5a4a3a';
      ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(16, 12); ctx.lineTo(11, -4); ctx.lineTo(-11, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = done ? '#7ef2a1' : '#9ad8ff';
      ctx.globalAlpha = done ? 0.9 : 0.6 + Math.sin(t) * 0.25;
      ctx.beginPath(); ctx.arc(0, -12, 7, 0, 6.284); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(230,240,255,0.85)';
      ctx.fillText('神坛', 0, 30);
    } else {
      // 被围困者：笼子
      ctx.strokeStyle = done ? 'rgba(140,245,160,0.5)' : 'rgba(220,200,160,0.8)';
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.moveTo(k * 8, -14); ctx.lineTo(k * 8, 12); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(12, -14); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPickup(ctx, pk) {
    const t = G.now() / 320 + pk.x;
    ctx.save();
    ctx.translate(pk.x, pk.y - 6 + Math.sin(t) * 2);
    if (pk.kind === 'coin') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#a87b1a';
      ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('金', 0, 3);
    } else {
      const def = G.ITEM[pk.item] || {};
      const col = def.type === 'equipment' ? '#9ad8ff' : def.type === 'quest' || def.type === 'treasure' ? '#ffd166' : '#c8e6a0';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 6, 7, 3, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 特效 ---------- */
  function drawFx(ctx, g) {
    g.fx.forEach(f => {
      const k = f.t / f.dur;
      ctx.save();
      if (f.kind === 'slash') {
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.strokeStyle = f.color || 'rgba(255,240,200,0.9)';
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(0, 0, f.r * (0.6 + k * 0.5), -0.9 + k * 0.3, 0.9 + k * 0.3);
        ctx.stroke();
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, G.lerp(f.r0, f.r1, k), 0, 6.284); ctx.stroke();
      } else if (f.kind === 'cone') {
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.globalAlpha = (1 - k) * 0.6;
        const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, f.len);
        grad.addColorStop(0, 'rgba(255,240,190,0.9)');
        grad.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, f.len * (0.7 + k * 0.35), -f.angle / 2, f.angle / 2);
        ctx.closePath(); ctx.fill();
      } else if (f.kind === 'beam') {
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.globalAlpha = 1 - k;
        const grad = ctx.createLinearGradient(0, 0, f.len, 0);
        grad.addColorStop(0, 'rgba(255,240,180,0.95)');
        grad.addColorStop(1, 'rgba(255,90,40,0.2)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, -(14 * (1 - k) + 6), f.len, (14 * (1 - k) + 6) * 2);
      } else if (f.kind === 'bolt') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 3;
        ctx.shadowColor = '#69c6ff'; ctx.shadowBlur = 12;
        ctx.beginPath();
        f.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
      } else if (f.kind === 'telegraph') {
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.284); ctx.stroke();
      } else if (f.kind === 'particle') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        const x = f.x + f.vx * (f.t / 1000), y = f.y + f.vy * (f.t / 1000) + 90 * Math.pow(f.t / 1000, 2);
        ctx.beginPath(); ctx.arc(x, y, f.s * (1 - k * 0.5), 0, 6.284); ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawTexts(ctx, g) {
    ctx.save();
    ctx.textAlign = 'center';
    g.texts.forEach(t => {
      const k = t.t / t.dur;
      ctx.globalAlpha = 1 - Math.pow(k, 2);
      ctx.font = '700 15px system-ui,-apple-system,sans-serif';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    });
    ctx.restore();
  }
})();
