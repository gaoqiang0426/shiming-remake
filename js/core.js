/* 使命 · 安卓复刻 — 核心层：状态 / 属性 / 背包 / 任务 / 存档 */
(function () {
  'use strict';
  const G = window.G = window.G || {};

  /* ---------- 基础工具 ---------- */
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };
  G.T = k => (window.S && window.S[k]) || k;
  G.now = () => performance.now();

  /* ---------- 数据索引 ---------- */
  const D = window.DATA;
  G.MAP = {}; D.maps.forEach(m => G.MAP[m.id] = m);
  G.QUEST = {}; D.quests.forEach(q => G.QUEST[q.id] = q);
  G.NPC = {}; Object.keys(D.npcs).forEach(k => G.NPC[k] = D.npcs[k]);
  G.ITEM = D.items; G.SKILL = D.skills; G.SHOP = D.shops; G.ENEMY = D.enemies;
  G.QUESTS = D.quests;
  G.SKILL_IDS = Object.keys(D.skills);

  /* ---------- 世界常量 ---------- */
  G.WORLD_W = 1632; G.WORLD_H = 1056;
  G.POS_SCALE = 1.7; G.POS_OX = 56; G.POS_OY = 40;
  G.px = x => G.POS_OX + x * G.POS_SCALE;
  G.py = y => G.POS_OY + y * G.POS_SCALE;

  G.REGION = {
    region_1: { name: '草原', base: '#4e7a44', alt: '#578548', edge: '#3c6036', road: '#7d9a62', accent: '#a8c066', sky: '#2c3d26' },
    region_2: { name: '雪原', base: '#cdd9e2', alt: '#dbe6ee', edge: '#a9bccb', road: '#aec2d0', accent: '#8fb6d6', sky: '#39465a' },
    region_3: { name: '沙漠', base: '#c9a464', alt: '#d4b073', edge: '#a98a52', road: '#e0c48c', accent: '#8d6a3c', sky: '#4a3a24' },
    region_4: { name: '熔岩', base: '#39262a', alt: '#442a2c', edge: '#5c2a20', road: '#6b3a2c', accent: '#e2622c', sky: '#1b1013' }
  };

  /* ---------- 玩家 ---------- */
  G.BASE = { hp: 150, qi: 70, atk: 12, def: 5, spd: 158, crit: 0.05, critMul: 1.75 };

  G.newState = function () {
    const st = {
      v: 1,
      map: 'm01',
      x: 0, y: 0, facing: 0,
      level: 1, xp: 0,
      attr: { str: 0, con: 0, agi: 0, int: 0 },
      points: { attr: 5, skill: 1 },
      skillLv: {},
      equipped: ['', '', '', ''],
      coins: 60,
      bag: [],
      equip: { weapon: '', armor: '', boots: '', amulet: '' },
      quests: {},
      flags: {},
      kills: 0, deaths: 0, playTime: 0, cleared: false,
      created: Date.now()
    };
    G.bagAdd(st, 'item_training_sword', 1);
    G.bagAdd(st, 'item_cloth_armor', 1);
    G.bagAdd(st, 'item_red_potion_s', 3);
    G.bagAdd(st, 'item_blue_potion_s', 2);
    st.equip.weapon = st.bag.splice(0, 1)[0];
    st.equip.armor = st.bag.splice(0, 1)[0];
    // 初始技能：飞镖（不消耗技能点）
    st.skillLv.s01 = 1;
    st.equipped[0] = 's01';
    st.hp = 1; st.qi = 1;
    const s = G.stats(st);
    st.hp = s.maxHp; st.qi = s.maxQi;
    // 首个主线自动开始
    G.QUESTS.filter(q => q.startOnNew).forEach(q => st.quests[q.id] = { state: 'active', prog: {} });
    return st;
  };

  G.xpNeed = lv => Math.floor(40 * Math.pow(lv, 1.55));

  G.stats = function (st) {
    const a = st.attr, lv = st.level;
    const out = {
      maxHp: G.BASE.hp + a.con * 9 + (lv - 1) * 16,
      maxQi: G.BASE.qi + a.int * 6 + (lv - 1) * 3,
      atk: G.BASE.atk + a.str * 2.1 + (lv - 1) * 1.5,
      def: G.BASE.def + a.con * 0.9 + (lv - 1) * 1.3,
      spd: G.BASE.spd * (1 + a.agi * 0.0035),
      crit: G.BASE.crit + a.agi * 0.0025,
      critMul: G.BASE.critMul,
      magic: 1 + a.int * 0.012
    };
    ['weapon', 'armor', 'boots', 'amulet'].forEach(slot => {
      const it = st.equip[slot];
      if (!it) return;
      const def = G.ITEM[it.id];
      if (!def || !def.equip) return;
      const gain = 1 + (it.up || 0) * 0.12;
      def.equip.mods.forEach(m => {
        const v = (m.value || 0) * gain;
        if (m.stat === 'physical_attack') out.atk += v;
        else if (m.stat === 'defense') out.def += v;
        else if (m.stat === 'max_hp') out.maxHp += v;
        else if (m.stat === 'move_speed') out.spd *= 1 + v;
      });
    });
    const buff = G.buffValue(st, 'attack');
    if (buff) out.atk *= buff;
    out.maxHp = Math.round(out.maxHp);
    out.maxQi = Math.round(out.maxQi);
    out.atk = Math.round(out.atk);
    out.def = Math.round(out.def);
    return out;
  };

  /* ---------- 增益 / 护盾 ---------- */
  G.buffs = [];
  G.buffValue = function (st, stat) {
    let v = 0;
    G.buffs.forEach(b => {
      if (b.stat !== stat) return;
      if (b.until < G.now()) return;
      v += (b.mul - 1);
    });
    return v ? 1 + v : 0;
  };
  G.hasBuff = (stat) => G.buffValue(null, stat) > 0;

  /* ---------- 背包 ---------- */
  G.bagAdd = function (st, id, n, up) {
    n = n || 1; up = up || 0;
    const def = G.ITEM[id];
    if (!def) return false;
    if (def.type === 'equipment' || def.stack === 1) {
      for (let i = 0; i < n; i++) st.bag.push({ id, n: 1, up });
      return true;
    }
    let left = n;
    for (const b of st.bag) {
      if (b.id === id && b.n < def.stack) {
        const add = Math.min(def.stack - b.n, left);
        b.n += add; left -= add;
        if (!left) break;
      }
    }
    while (left > 0) {
      const add = Math.min(def.stack, left);
      st.bag.push({ id, n: add, up: 0 });
      left -= add;
    }
    return true;
  };
  G.bagCount = (st, id) => st.bag.reduce((s, b) => s + (b.id === id ? b.n : 0), 0);
  G.bagRemove = function (st, id, n) {
    let left = n || 1;
    for (let i = st.bag.length - 1; i >= 0 && left > 0; i--) {
      const b = st.bag[i];
      if (b.id !== id) continue;
      const take = Math.min(b.n, left);
      b.n -= take; left -= take;
      if (b.n <= 0) st.bag.splice(i, 1);
    }
    return left === 0;
  };
  G.itemUpgradeCost = function (entry) {
    const def = G.ITEM[entry.id];
    if (!def) return null;
    let rec = def.recipe;
    if (!rec && def.equip && def.equip.rec) {
      const r = G.ITEM[def.equip.rec];
      rec = r && r.recipe;
    }
    if (!rec || !rec.ing) return null;
    const up = entry.up || 0;
    return {
      coins: Math.round(rec.coins * (1 + up * 0.8)),
      ing: rec.ing.map(i => ({ item: i.item_id, n: Math.ceil(i.count * (1 + up * 0.5)) })),
      max: (def.equip && def.equip.maxUp) || 5
    };
  };

  /* ---------- 装备 ---------- */
  G.equipEntry = function (st, idx) {
    const entry = st.bag[idx];
    if (!entry) return { ok: false, msg: '物品不存在' };
    const def = G.ITEM[entry.id];
    if (!def || !def.equip) return { ok: false, msg: '该物品无法装备' };
    if (st.level < def.equip.req) return { ok: false, msg: '需要等级 ' + def.equip.req };
    const slot = def.equip.slot;
    const old = st.equip[slot];
    st.bag.splice(idx, 1);
    st.equip[slot] = entry;
    if (old) st.bag.push(old);
    return { ok: true };
  };

  /* ---------- 技能 ---------- */
  G.skillLv = (st, id) => st.skillLv[id] || 0;
  G.skillDef = (st, id) => {
    const s = G.SKILL[id];
    const lv = G.clamp(st.skillLv[id] || 0, 1, 4);
    return s.levels[lv - 1];
  };
  G.skillUnlocked = (st, id) => st.level >= G.SKILL[id].levels[0].req;
  G.learnSkill = function (st, id) {
    const s = G.SKILL[id];
    const cur = st.skillLv[id] || 0;
    if (cur >= 4) return { ok: false, msg: '已满级' };
    const next = s.levels[cur];
    if (st.level < next.req) return { ok: false, msg: '需要等级 ' + next.req };
    if (st.points.skill < 1) return { ok: false, msg: '技能点不足' };
    st.points.skill--;
    st.skillLv[id] = cur + 1;
    if (!st.equipped.includes(id)) {
      const free = st.equipped.indexOf('');
      if (free >= 0) st.equipped[free] = id;
    }
    return { ok: true, msg: '已提升：' + G.T(s.name) + ' Lv.' + (cur + 1) };
  };

  /* ---------- 任务 ---------- */
  G.qState = (st, id) => (st.quests[id] && st.quests[id].state) || 'locked';
  G.qProgress = function (st, q) {
    const rec = st.quests[q.id];
    const prog = (rec && rec.prog) || {};
    return q.objectives.map(o => {
      let cur = 0;
      if (o.type === 'kill') cur = prog[o.id] || 0;
      else if (o.type === 'collect') {
        cur = G.bagCount(st, o.target) > 0 || st.flags['got_' + o.target] ? o.count : 0;
      } else if (o.type === 'rescue') cur = st.flags['rescue_' + o.target] ? o.count : 0;
      else if (o.type === 'place') cur = st.flags['place_' + o.target] ? o.count : 0;
      return { o, cur: Math.min(cur, o.count), need: o.count, done: cur >= o.count };
    });
  };
  G.qReady = function (st, q) {
    const rec = st.quests[q.id];
    if (!rec || rec.state !== 'active') return false;
    return G.qProgress(st, q).every(p => p.done);
  };
  G.qAvailable = function (st, q) {
    if (st.quests[q.id]) return false;
    return (q.prereq || []).every(p => G.qState(st, p) === 'completed');
  };
  G.qAccept = function (st, q) {
    if (!G.qAvailable(st, q)) return false;
    st.quests[q.id] = { state: 'active', prog: {} };
    return true;
  };
  G.qComplete = function (st, q) {
    st.quests[q.id] = st.quests[q.id] || { state: 'active', prog: {} };
    st.quests[q.id].state = 'completed';
    const rw = q.rewards || {};
    if (rw.xp) G.gainXp(st, rw.xp);
    if (rw.coins) st.coins += rw.coins;
    (rw.items || []).forEach(i => G.bagAdd(st, i.item_id, i.count || 1));
    // 解锁后续
    return rw;
  };
  G.gainXp = function (st, xp) {
    st.xp += xp;
    let ups = 0;
    while (st.xp >= G.xpNeed(st.level) && st.level < 60) {
      st.xp -= G.xpNeed(st.level);
      st.level++; ups++;
      st.points.attr += 5;
      st.points.skill += 1;
    }
    if (ups) {
      const s = G.stats(st);
      st.hp = s.maxHp; st.qi = s.maxQi;
      G.notify('升级！等级 ' + st.level + '（+5 属性点 / +1 技能点）', 'level');
      G.sfx('level');
    }
    return ups;
  };
  G.objectiveText = function (st, q) {
    const rows = G.qProgress(st, q);
    return rows.map(r => {
      const o = r.o;
      let label;
      if (o.type === 'kill') label = '击杀 ' + (G.ENEMY[o.target] ? G.T(G.ENEMY[o.target].name) : o.target);
      else if (o.type === 'collect') label = '取得 ' + (G.ITEM[o.target] ? G.T(G.ITEM[o.target].name) : o.target);
      else if (o.type === 'rescue') label = '解救 ' + (G.NPC[o.target] ? G.T(G.NPC[o.target].name) : o.target);
      else if (o.type === 'place') label = '放置宝物';
      else label = o.type;
      return label + ' ' + r.cur + '/' + r.need;
    }).join('　');
  };
  G.currentQuest = function (st) {
    for (const q of G.QUESTS) {
      if (st.quests[q.id] && st.quests[q.id].state === 'active') return q;
    }
    for (const q of G.QUESTS) {
      if (!st.quests[q.id] && G.qAvailable(st, q)) return q;
    }
    return null;
  };

  /* ---------- 通知 ---------- */
  G.notices = [];
  G.notify = function (text, kind) {
    G.notices.push({ text, kind: kind || 'info', t: G.now() });
    if (G.notices.length > 4) G.notices.shift();
    if (G.ui && G.ui.paintNotices) G.ui.paintNotices();
  };

  /* ---------- 存档 ---------- */
  const KEY = 'mission_remake_v1_';
  G.saveSlots = ['auto', '1', '2', '3'];
  G.saveGame = function (slot, st) {
    try {
      const payload = { v: 1, at: Date.now(), st: JSON.parse(JSON.stringify(st)) };
      localStorage.setItem(KEY + slot, JSON.stringify(payload));
      G.notify('已保存至' + (slot === 'auto' ? '自动存档' : '存档 ' + slot), 'save');
      return true;
    } catch (e) {
      G.notify('保存失败：存储空间不足', 'warn');
      return false;
    }
  };
  G.loadGame = function (slot) {
    try {
      const raw = localStorage.getItem(KEY + slot);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.st) return null;
      return obj;
    } catch (e) { return null; }
  };
  G.slotInfo = function (slot) {
    const o = G.loadGame(slot);
    if (!o) return null;
    const st = o.st;
    return {
      at: o.at, level: st.level, map: G.T(G.MAP[st.map].nameKey),
      quest: (G.currentQuest(st) || {}).title ? G.T(G.currentQuest(st).title) : '全部完成',
      time: st.playTime || 0, cleared: !!st.cleared
    };
  };
  G.clearSlot = function (slot) { localStorage.removeItem(KEY + slot); };

  /* ---------- 音效（程序合成，无外部素材） ---------- */
  let actx = null, muted = false;
  G.sfxOn = () => { muted = false; };
  G.sfxOff = () => { muted = true; };
  G.sfx = function (kind) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      let f0 = 440, f1 = 200, dur = 0.12, type = 'square', vol = 0.05;
      if (kind === 'hit') { f0 = 220; f1 = 90; dur = 0.09; type = 'square'; vol = 0.05; }
      else if (kind === 'skill') { f0 = 520; f1 = 880; dur = 0.16; type = 'triangle'; vol = 0.055; }
      else if (kind === 'hurt') { f0 = 160; f1 = 60; dur = 0.2; type = 'sawtooth'; vol = 0.06; }
      else if (kind === 'level') { f0 = 523; f1 = 1046; dur = 0.4; type = 'triangle'; vol = 0.07; }
      else if (kind === 'coin') { f0 = 880; f1 = 1320; dur = 0.09; type = 'sine'; vol = 0.04; }
      else if (kind === 'ui') { f0 = 640; f1 = 640; dur = 0.05; type = 'sine'; vol = 0.03; }
      else if (kind === 'boss') { f0 = 110; f1 = 55; dur = 0.6; type = 'sawtooth'; vol = 0.075; }
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* 静默 */ }
  };
})();
