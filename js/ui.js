/* 使命 · 安卓复刻 — 界面层：HUD / 虚拟摇杆 / 触控按钮 / 面板 / 剧情对话 */
(function () {
  'use strict';
  const G = window.G;
  G.input = { mx: 0, my: 0, attacking: false };
  G.ui = { dirty: true };

  const $ = id => document.getElementById(id);
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function btn(label, cls, fn) {
    const b = el('button', 'btn ' + (cls || ''), label);
    b.addEventListener('click', ev => { ev.stopPropagation(); G.sfx('ui'); fn(ev); });
    return b;
  }
  const T = k => G.T(k);
  const name = id => (G.ITEM[id] ? T(G.ITEM[id].name) : id);

  /* ================= 启动 / 标题 ================= */
  G.ui.init = function () {
    G.ui.bindTouch();
    G.ui.bindKeys();
    G.ui.paintNotices();
    G.ui.showTitle();
  };

  G.ui.showTitle = function () {
    const t = $('title');
    t.innerHTML = '';
    const box = el('div', 'title-box');
    const logo = el('div', 'logo');
    logo.innerHTML = '<span class="logo-main">使 命</span><span class="logo-sub">复刻版 · 洛罕遗志</span>';
    box.appendChild(logo);
    const meta = el('div', 'title-meta', '30 张场景 · 24 条主线 · 11 条技能线 · 离线单机');
    box.appendChild(meta);

    const menu = el('div', 'title-menu');
    menu.appendChild(btn('开始新的使命', 'primary', () => G.ui.newGame()));
    const hasSave = G.saveSlots.some(s => G.loadGame(s));
    const cont = btn('继续冒险', hasSave ? '' : 'disabled', () => {
      const slot = G.saveSlots.slice().reverse().find(s => G.loadGame(s));
      if (slot) G.ui.loadFromSlot(slot);
    });
    if (!hasSave) cont.disabled = true;
    menu.appendChild(cont);
    menu.appendChild(btn('存档管理', '', () => G.ui.openPanel('save', true)));
    menu.appendChild(btn('玩法说明', '', () => G.ui.openPanel('help', true)));
    menu.appendChild(btn('关于本作', '', () => G.ui.openPanel('about', true)));
    box.appendChild(menu);
    const foot = el('div', 'title-foot', '非官方同人复刻 · 全部美术与音效为程序生成 · 不含原版素材');
    box.appendChild(foot);
    t.appendChild(box);
    t.classList.add('show');
    $('hud').classList.remove('show');
    $('controls').classList.remove('show');
    $('game').style.filter = 'saturate(.6) brightness(.55) blur(2px)';
  };

  G.ui.hideTitle = function () {
    $('title').classList.remove('show');
    $('hud').classList.add('show');
    $('controls').classList.add('show');
    $('game').style.filter = '';
  };

  G.ui.newGame = function () {
    const st = G.newState();
    G.startGame(st, {});
    G.ui.hideTitle();
    G.ui.hideAll();
    G.notify('任务开始：' + T(G.QUESTS[0].title) + '。先去光明城东门外的草原。', 'quest');
    G.ui.hint('左侧拖动移动 · 右下角按钮攻击与施法', 5200);
    if (window.innerHeight > window.innerWidth) {
      setTimeout(() => G.notify('横屏游玩视野更好', 'info'), 2200);
    }
  };

  G.ui.loadFromSlot = function (slot) {
    const o = G.loadGame(slot);
    if (!o) return;
    const st = o.st;
    if (!st.quests) st.quests = {};
    G.startGame(st, {});
    G.ui.hideTitle();
    G.ui.hideAll();
    G.notify('已读取' + (slot === 'auto' ? '自动存档' : '存档 ' + slot), 'save');
  };

  /* ================= HUD ================= */
  G.ui.tickHud = function () {
    const g = G.game;
    if (!g) return;
    const st = g.st, S = G.stats(st), p = g.player;
    const hpPct = G.clamp(p.hp / S.maxHp, 0, 1);
    const qiPct = G.clamp(p.qi / S.maxQi, 0, 1);
    $('hpFill').style.width = (hpPct * 100) + '%';
    $('qiFill').style.width = (qiPct * 100) + '%';
    $('hpText').textContent = Math.max(0, Math.round(p.hp)) + ' / ' + S.maxHp;
    $('qiText').textContent = Math.round(p.qi) + ' / ' + S.maxQi;
    $('lvText').textContent = 'Lv.' + st.level;
    $('coinText').textContent = st.coins;
    $('xpFill').style.width = ((st.xp / G.xpNeed(st.level)) * 100) + '%';

    // 技能冷却
    for (let i = 0; i < 4; i++) {
      const id = st.equipped[i];
      const node = $('sk' + i);
      if (!node) continue;
      const cdNode = node.querySelector('.cd');
      const label = node.querySelector('.sk-name');
      if (!id || !(st.skillLv[id] > 0)) {
        label.textContent = '空';
        cdNode.style.height = '0%';
        node.classList.add('empty');
        continue;
      }
      node.classList.remove('empty');
      label.textContent = T(G.SKILL[id].name);
      const sd = G.skillDef(st, id);
      const left = (p.skillCd[id] || 0) / sd.cd;
      cdNode.style.height = (G.clamp(left, 0, 1) * 100) + '%';
      node.classList.toggle('noqi', p.qi < sd.cost);
    }
    // 交互提示
    const near = G.nearInteract ? G.nearInteract() : null;
    $('btnAction').classList.toggle('show', !!near);
    if (near) {
      const isNpc = near.type === 'npc';
      $('btnAction').textContent = isNpc ? '交谈' : (near.ref.kind === 'place' ? '放置' : '解救');
    }

    // 任务追踪
    const q = G.currentQuest(st);
    const qt = $('questBox');
    if (q) {
      const ready = G.qReady(st, q);
      const npc = G.NPC[q.turnIn];
      let line2 = G.objectiveText(st, q);
      let line3 = '';
      if (ready && q.mode !== 'auto') line3 = '← 返回' + (npc ? T(npc.name) : '发布人') + '交付';
      else if (!st.quests[q.id]) line3 = '去' + (npc ? T(npc.name) : '') + '处接取';
      else line3 = '目标地图：' + T(G.MAP[q.map].nameKey);
      qt.innerHTML = '<div class="q-title">' + T(q.title) + (ready ? ' <em>可交付</em>' : '') + '</div>' +
        '<div class="q-line">' + line2 + '</div>' +
        '<div class="q-line dim">' + line3 + '</div>';
      qt.style.display = 'block';
    } else {
      qt.style.display = 'none';
    }

    // Boss 血条：仅在接近或已交战时显示
    const boss = g.enemies.find(e => e.boss && e.alive);
    const bb = $('bossBar');
    const bossNear = boss && (G.dist(g.player, boss) < 560 || boss.hp < boss.maxHp);
    if (bossNear) {
      bb.classList.add('show');
      $('bossName').textContent = G.enemyName(boss) + ' · Lv.' + boss.level;
      $('bossFill').style.width = (boss.hp / boss.maxHp * 100) + '%';
    } else bb.classList.remove('show');

    $('deathFade').style.opacity = g.dead ? 1 : 0;
  };

  /* ================= 通知 / 提示 ================= */
  G.ui.paintNotices = function () {
    const box = $('notices');
    if (!box) return;
    box.innerHTML = '';
    G.notices.slice(-3).forEach(n => {
      const d = el('div', 'notice ' + (n.kind || ''));
      d.textContent = n.text;
      box.appendChild(d);
      setTimeout(() => d.classList.add('out'), 2900);
      setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3500);
    });
  };
  G.ui.hint = function (text, ms) {
    const h = $('hint');
    h.textContent = text;
    h.classList.add('show');
    clearTimeout(G.ui._hintT);
    G.ui._hintT = setTimeout(() => h.classList.remove('show'), ms || 3000);
  };

  /* ================= 对话 ================= */
  G.ui.showDialog = function (opt) {
    const d = $('dialog');
    d.innerHTML = '';
    const card = el('div', 'dlg-card');
    if (opt.name) card.appendChild(el('div', 'dlg-name', opt.name));
    const tx = el('div', 'dlg-text');
    tx.textContent = opt.text || '';
    card.appendChild(tx);
    const acts = el('div', 'dlg-acts');
    (opt.actions || [{ label: '离开', act: 'close' }]).forEach(a => {
      const b = btn(a.label, a.tone || '', () => {
        G.ui.closeDialog();
        if (a.act === 'accept') G.acceptQuest(a.q);
        else if (a.act === 'turnin') G.turnInQuest(a.q);
        else if (a.act === 'shop') G.ui.openPanel('shop', false, { shop: a.shop });
      });
      acts.appendChild(b);
    });
    card.appendChild(acts);
    d.appendChild(card);
    d.classList.add('show');
    G.game && (G.game.paused = true);
  };
  G.ui.closeDialog = function () {
    $('dialog').classList.remove('show');
    if (G.game && !G.game.dead) G.game.paused = false;
  };

  /* ================= 面板 ================= */
  G.ui.openPanel = function (kind, fromTitle, opt) {
    const p = $('panel');
    // 从标题页打开面板时先收起标题，否则面板会被标题层盖住
    const titleEl = $('title');
    const hadTitle = titleEl.classList.contains('show');
    if (hadTitle) titleEl.classList.remove('show');
    p.innerHTML = '';
    const card = el('div', 'panel-card');
    const head = el('div', 'panel-head');
    head.appendChild(el('h2', '', {
      save: '存档管理', help: '玩法说明', about: '关于本作', bag: '行囊',
      char: '角色', skills: '技能', quests: '任务', shop: '商店与锻造', pause: '暂停'
    }[kind] || ''));
    const close = btn('✕', 'ghost', () => {
      $('panel').classList.remove('show');
      if (G.game && !G.game.dead) G.game.paused = false;
      else if (!G.game) G.ui.showTitle();
    });
    close.dataset.close = '1';
    head.appendChild(close);
    card.appendChild(head);
    const body = el('div', 'panel-body');
    card.appendChild(body);
    p.appendChild(card);

    if (kind === 'save') renderSave(body, fromTitle);
    else if (kind === 'help') renderHelp(body);
    else if (kind === 'about') renderAbout(body);
    else if (kind === 'bag') renderBag(body);
    else if (kind === 'char') renderChar(body);
    else if (kind === 'skills') renderSkills(body);
    else if (kind === 'quests') renderQuests(body);
    else if (kind === 'shop') renderShop(body, opt && opt.shop);
    else if (kind === 'pause') renderPause(body);

    p.classList.add('show');
    if (G.game && !G.game.dead) G.game.paused = true;
  };

  function coinsRow(parent) {
    const st = G.game.st;
    const row = el('div', 'row coins');
    row.innerHTML = '<span>金币</span><b>' + st.coins + '</b>';
    parent.appendChild(row);
  }

  /* ---- 存档 ---- */
  function renderSave(body, fromTitle) {
    const list = el('div', 'slot-list');
    G.saveSlots.forEach(slot => {
      const info = G.slotInfo(slot);
      const card = el('div', 'slot' + (info ? '' : ' empty'));
      const l = el('div', 'slot-l');
      l.appendChild(el('div', 'slot-title', slot === 'auto' ? '自动存档' : '存档 ' + slot));
      if (info) {
        l.appendChild(el('div', 'slot-meta', 'Lv.' + info.level + ' · ' + info.map + ' · ' + info.quest));
        const d = new Date(info.at);
        l.appendChild(el('div', 'slot-meta dim', d.toLocaleString('zh-CN') + (info.cleared ? ' · 已通关' : '')));
      } else {
        l.appendChild(el('div', 'slot-meta dim', '空'));
      }
      card.appendChild(l);
      const acts = el('div', 'slot-acts');
      if (fromTitle) {
        if (info) acts.appendChild(btn('读取', 'primary', () => G.ui.loadFromSlot(slot)));
      } else {
        if (slot !== 'auto') acts.appendChild(btn(info ? '覆盖' : '保存', '', () => {
          G.saveGame(slot, G.game.st);
          G.ui.openPanel('save');
        }));
        if (info) acts.appendChild(btn('读取', '', () => {
          G.ui.loadFromSlot(slot);
        }));
        if (info && slot !== 'auto') acts.appendChild(btn('删除', 'danger', () => {
          G.clearSlot(slot);
          G.ui.openPanel('save');
        }));
      }
      card.appendChild(acts);
      list.appendChild(card);
    });
    body.appendChild(list);
    if (!fromTitle) {
      body.appendChild(btn('返回游戏', 'primary wide', () => {
        $('panel').classList.remove('show');
        if (G.game && !G.game.dead) G.game.paused = false;
      }));
    }
  }

  /* ---- 说明 ---- */
  function renderHelp(body) {
    const html = [
      ['移动', '左侧半屏任意位置按下拖动 = 虚拟摇杆；桌面可用 WASD / 方向键'],
      ['攻击', '右下角大剑按钮（可长按连击），桌面 J 键'],
      ['技能', '四个技能按钮，桌面 1/2/3/4；技能需在「技能」页学习并装备'],
      ['药水', '红药回血、蓝药回灵气，桌面 Q / E'],
      ['交互', '靠近 NPC 或神坛时出现「交谈 / 放置」按钮，桌面 空格'],
      ['任务', '主线严格顺序推进：接取 → 完成目标 → 回到发布人处交付'],
      ['成长', '每级 +5 属性点 +1 技能点；属性点按自己流派分配'],
      ['存档', '三个手动槽 + 一个自动槽；切图、接交任务、Boss 前自动保存']
    ];
    html.forEach(([k, v]) => {
      const r = el('div', 'help-row');
      r.appendChild(el('div', 'help-k', k));
      r.appendChild(el('div', 'help-v', v));
      body.appendChild(r);
    });
  }

  function renderAbout(body) {
    const d = el('div', 'about');
    d.innerHTML = '<p><b>《使命》安卓复刻 V1.0</b> —— 基于 BBK9588 原作的同人重制，非官方作品。</p>' +
      '<p>内容骨架（4 地区 / 24 主线 / 4 宝物 / 11 技能线 / 神坛决战）来自公开的复刻策划文档；' +
      '场景、角色、特效、音效全部由代码程序化生成，<b>不含任何原版图片、文本与音乐素材</b>。</p>' +
      '<p>本作为离线单机：无账号、无联网请求、无广告与内购。存档保存在本机浏览器。</p>' +
      '<p class="dim">单文件 Web 应用（PWA），可「添加到主屏幕」当作 App 使用。</p>';
    body.appendChild(d);
  }

  /* ---- 行囊 ---- */
  function renderBag(body) {
    const st = G.game.st;
    coinsRow(body);
    if (!st.bag.length) body.appendChild(el('div', 'empty-tip', '行囊空空如也。'));
    const grid = el('div', 'item-grid');
    st.bag.forEach((b, idx) => {
      const def = G.ITEM[b.id];
      const card = el('div', 'item-card t-' + def.type);
      const top = el('div', 'item-top');
      top.appendChild(el('span', 'item-name', T(def.name) + (b.up ? ' +' + b.up : '')));
      if (b.n > 1) top.appendChild(el('span', 'item-n', '×' + b.n));
      card.appendChild(top);
      card.appendChild(el('div', 'item-desc', def.desc ? T(def.desc) : ''));
      const acts = el('div', 'item-acts');
      if (def.type === 'consumable') {
        acts.appendChild(btn('使用', 'primary', () => {
          G.useItemIndex(idx);
          G.ui.openPanel('bag');
        }));
      }
      if (def.type === 'equipment') {
        acts.appendChild(btn(st.level < def.equip.req ? '需 Lv.' + def.equip.req : '装备', st.level < def.equip.req ? 'disabled' : 'primary', () => {
          const rr = G.equipEntry(st, idx);
          if (!rr.ok) G.notify(rr.msg, 'warn');
          else { G.notify('已装备 ' + T(def.name), 'item'); G.ui.openPanel('bag'); }
        }));
      }
      if (def.sellable !== false && def.price) {
        acts.appendChild(btn('卖 ' + Math.floor(def.price * 0.4), '', () => {
          st.coins += Math.floor(def.price * 0.4);
          G.bagRemove(st, b.id, 1);
          G.notify('出售 ' + T(def.name), 'item');
          G.ui.openPanel('bag');
        }));
      }
      card.appendChild(acts);
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  G.useItemIndex = function (idx) {
    const st = G.game.st, p = G.game.player, S = G.stats(st);
    const b = st.bag[idx];
    if (!b) return;
    const def = G.ITEM[b.id];
    if (!def || def.type !== 'consumable') return;
    def.use.forEach(e => {
      if (e.op === 'restore_health') p.hp = Math.min(S.maxHp, p.hp + e.amount);
      if (e.op === 'restore_resource') p.qi = Math.min(S.maxQi, p.qi + e.amount);
    });
    G.bagRemove(st, b.id, 1);
    G.sfx('ui');
  };

  /* ---- 角色 ---- */
  function renderChar(body) {
    const st = G.game.st, S = G.stats(st);
    const top = el('div', 'char-top');
    top.innerHTML = '<div class="lv-badge">Lv.' + st.level + '</div>' +
      '<div class="char-nums">生命 ' + S.maxHp + '　灵气 ' + S.maxQi + '　攻击 ' + S.atk + '　防御 ' + S.def +
      '<br><span class="dim">暴击 ' + (S.crit * 100).toFixed(1) + '%　移速 ' + Math.round(S.spd) + '　经验 ' + st.xp + '/' + G.xpNeed(st.level) + '</span></div>';
    body.appendChild(top);

    const attrBox = el('div', 'attr-box');
    const conf = [['str', '力量', '攻击 +2.1 / 点'], ['con', '体质', '生命 +9、防御 +0.9'], ['agi', '敏捷', '移速与暴击'], ['int', '智力', '灵气 +6、法术 +1.2%']];
    conf.forEach(([k, label, desc]) => {
      const row = el('div', 'attr-row');
      row.appendChild(el('div', 'attr-name', label));
      row.appendChild(el('div', 'attr-val', String(st.attr[k])));
      row.appendChild(el('div', 'attr-desc', desc));
      const add = btn('+', 'plus', () => {
        if (st.points.attr <= 0) { G.notify('没有可分配属性点', 'warn'); return; }
        st.attr[k]++; st.points.attr--;
        G.ui.openPanel('char');
        G.ui.dirty = true;
      });
      if (st.points.attr <= 0) add.disabled = true;
      row.appendChild(add);
      attrBox.appendChild(row);
    });
    body.appendChild(attrBox);
    body.appendChild(el('div', 'tip', '剩余属性点：' + st.points.attr + '　剩余技能点：' + st.points.skill));

    const eq = el('div', 'equip-box');
    [['weapon', '武器'], ['armor', '护甲'], ['boots', '鞋'], ['amulet', '护符']].forEach(([slot, label]) => {
      const it = st.equip[slot];
      const row = el('div', 'equip-row');
      row.appendChild(el('div', 'equip-slot', label));
      row.appendChild(el('div', 'equip-name', it ? T(G.ITEM[it.id].name) + (it.up ? ' +' + it.up : '') : '—'));
      if (it) {
        const def = G.ITEM[it.id];
        const mods = def.equip.mods.map(m => statLabel(m.stat) + ' +' + Math.round(m.value * (1 + (it.up || 0) * 0.12))).join('　');
        row.appendChild(el('div', 'equip-mod', mods));
        row.appendChild(btn('卸下', 'ghost', () => {
          st.bag.push(it); st.equip[slot] = '';
          G.ui.openPanel('char');
        }));
      }
      eq.appendChild(row);
    });
    body.appendChild(eq);
  }
  function statLabel(s) {
    return { physical_attack: '攻击', defense: '防御', max_hp: '生命', move_speed: '移速' }[s] || s;
  }

  /* ---- 技能 ---- */
  function renderSkills(body) {
    const st = G.game.st;
    const tip = el('div', 'tip', '技能点：' + st.points.skill + '　已装备 4 槽：' + st.equipped.map(id => id ? T(G.SKILL[id].name) : '空').join(' / '));
    body.appendChild(tip);
    const list = el('div', 'skill-list');
    Object.keys(G.SKILL).forEach(id => {
      const sk = G.SKILL[id];
      const lv = st.skillLv[id] || 0;
      const locked = st.level < sk.levels[0].req;
      const card = el('div', 'skill-card' + (lv ? '' : ' locked'));
      const head = el('div', 'skill-head');
      head.appendChild(el('span', 'skill-title', T(sk.name)));
      head.appendChild(el('span', 'skill-lv', lv ? 'Lv.' + lv : (locked ? 'Lv.' + sk.levels[0].req + ' 解锁' : '未学习')));
      card.appendChild(head);
      card.appendChild(el('div', 'skill-desc', T(sk.desc)));
      const l4 = sk.levels[3];
      card.appendChild(el('div', 'skill-meta', '灵气 ' + sk.levels[0].cost + '　冷却 ' + (sk.levels[0].cd / 1000).toFixed(1) + 's　' +
        '范围 ' + Math.round(sk.levels[0].range || 0) + '　满级伤害系数 ' + (l4.effects[0].power_coefficient || 0)));
      const acts = el('div', 'skill-acts');
      const up = btn(lv ? (lv >= 4 ? '已满级' : '升级（1 点）') : '学习（1 点）', lv >= 4 ? 'disabled' : 'primary', () => {
        const r = G.learnSkill(st, id);
        G.notify(r.msg, r.ok ? 'item' : 'warn');
        if (r.ok) G.ui.openPanel('skills');
      });
      if (locked || lv >= 4) up.disabled = true;
      acts.appendChild(up);
      if (lv > 0) {
        const slots = el('div', 'slot-picks');
        [0, 1, 2, 3].forEach(i => {
          const b = btn(String(i + 1), st.equipped[i] === id ? 'on' : 'ghost', () => {
            const old = st.equipped.indexOf(id);
            if (old >= 0) st.equipped[old] = '';
            st.equipped[i] = id;
            G.ui.openPanel('skills');
          });
          slots.appendChild(b);
        });
        acts.appendChild(el('span', 'mini-label', '装备到'));
        acts.appendChild(slots);
      }
      card.appendChild(acts);
      list.appendChild(card);
    });
    body.appendChild(list);
  }

  /* ---- 任务 ---- */
  function renderQuests(body) {
    const st = G.game.st;
    const box = el('div', 'quest-list');
    G.QUESTS.forEach(q => {
      const state = G.qState(st, q.id);
      const avail = G.qAvailable(st, q);
      if (state === 'locked' && !avail) return;
      const card = el('div', 'quest-card ' + (state || 'avail'));
      const head = el('div', 'quest-head');
      head.appendChild(el('span', 'quest-title', (q.seq < 10 ? '0' : '') + q.seq + '　' + T(q.title)));
      head.appendChild(el('span', 'quest-state',
        state === 'completed' ? '已完成' : state === 'active' ? (G.qReady(st, q) ? '可交付' : '进行中') : '可接取'));
      card.appendChild(head);
      card.appendChild(el('div', 'quest-desc', T(q.desc)));
      if (state === 'active') {
        G.qProgress(st, q).forEach(p => {
          const row = el('div', 'obj-row' + (p.done ? ' done' : ''));
          row.appendChild(el('span', 'obj-label', objectiveLabel(p.o)));
          row.appendChild(el('span', 'obj-num', p.cur + '/' + p.need));
          card.appendChild(row);
        });
      }
      card.appendChild(el('div', 'quest-meta',
        '地点：' + T(G.MAP[q.map].nameKey) + '　发布：' + (G.NPC[q.turnIn] ? T(G.NPC[q.turnIn].name) : '—') +
        '　奖励：' + q.rewards.xp + ' 经验' + (q.rewards.coins ? ' / ' + q.rewards.coins + ' 金' : '')));
      box.appendChild(card);
    });
    body.appendChild(box);
  }
  function objectiveLabel(o) {
    if (o.type === 'kill') return '击杀 ' + (G.ENEMY[o.target] ? T(G.ENEMY[o.target].name) : o.target);
    if (o.type === 'collect') return '取得 ' + (G.ITEM[o.target] ? T(G.ITEM[o.target].name) : o.target);
    if (o.type === 'rescue') return '解救 ' + (G.NPC[o.target] ? T(G.NPC[o.target].name) : o.target);
    if (o.type === 'place') return '在神坛放置宝物';
    return o.type;
  }

  /* ---- 商店 ---- */
  function renderShop(body, shopId) {
    const st = G.game.st;
    const shop = G.SHOP[shopId];
    if (!shop) { body.appendChild(el('div', 'empty-tip', '商店数据缺失')); return; }
    coinsRow(body);
    body.appendChild(el('h3', 'sub', T(shop.name)));
    const buy = el('div', 'shop-list');
    shop.entries.forEach(e => {
      const def = G.ITEM[e.item_id];
      if (!def) return;
      if (e.condition && e.condition.op === 'quest_state') {
        if (G.qState(st, e.condition.quest_id) !== e.condition.state) return;
      }
      const price = e.buy_price_override || def.price || 0;
      const row = el('div', 'shop-row');
      row.appendChild(el('div', 'shop-name', T(def.name) + (def.equip ? '（Lv.' + def.equip.req + '）' : '')));
      row.appendChild(el('div', 'shop-desc', T(def.desc)));
      row.appendChild(el('div', 'shop-price', price + ' 金'));
      row.appendChild(btn('购买', st.coins < price ? 'disabled' : 'primary', () => {
        if (st.coins < price) return;
        st.coins -= price;
        G.bagAdd(st, e.item_id, 1);
        G.notify('购入 ' + T(def.name), 'item');
        G.ui.openPanel('shop', false, { shop: shopId });
      }));
      buy.appendChild(row);
    });
    body.appendChild(buy);

    // 锻造
    body.appendChild(el('h3', 'sub', '锻造 · 强化'));
    const up = el('div', 'shop-list');
    const candidates = [];
    ['weapon', 'armor', 'boots', 'amulet'].forEach(s => { if (st.equip[s]) candidates.push({ entry: st.equip[s], equipped: true, slot: s }); });
    st.bag.forEach(b => { if (G.ITEM[b.id].equip) candidates.push({ entry: b, equipped: false }); });
    candidates.forEach(c => {
      const def = G.ITEM[c.entry.id];
      const cost = G.itemUpgradeCost(c.entry);
      if (!cost) return;
      const row = el('div', 'shop-row');
      row.appendChild(el('div', 'shop-name', T(def.name) + ' +' + (c.entry.up || 0) + ' / +' + cost.max));
      const canStones = cost.ing.map(i => G.bagCount(st, i.item) >= i.n).every(Boolean);
      row.appendChild(el('div', 'shop-desc', '需 ' + cost.ing.map(i => name(i.item) + '×' + i.n).join('、') + '　' + cost.coins + ' 金'));
      const b = btn(c.entry.up >= cost.max ? '满级' : '强化', (c.entry.up >= cost.max || !canStones || st.coins < cost.coins) ? 'disabled' : 'primary', () => {
        if (st.coins < cost.coins) return;
        if (!cost.ing.every(i => G.bagCount(st, i.item) >= i.n)) { G.notify('材料不足', 'warn'); return; }
        cost.ing.forEach(i => G.bagRemove(st, i.item, i.n));
        st.coins -= cost.coins;
        c.entry.up = (c.entry.up || 0) + 1;
        G.notify('强化成功：' + T(def.name) + ' +' + c.entry.up, 'item');
        G.ui.openPanel('shop', false, { shop: shopId });
      });
      if (c.entry.up >= cost.max || !canStones || st.coins < cost.coins) b.disabled = true;
      row.appendChild(b);
      up.appendChild(row);
    });
    if (!candidates.length) up.appendChild(el('div', 'empty-tip', '没有可强化的装备'));
    body.appendChild(up);
  }

  function renderPause(body) {
    const st = G.game.st;
    const info = el('div', 'pause-info');
    info.innerHTML = '<div>等级 <b>' + st.level + '</b>　金币 <b>' + st.coins + '</b>　击杀 <b>' + st.kills + '</b>　死亡 <b>' + st.deaths + '</b></div>' +
      '<div class="dim">游戏时长 ' + Math.floor(st.playTime / 60) + ' 分钟　当前 ' + T(G.MAP[st.map].nameKey) + '</div>';
    body.appendChild(info);
    const grid = el('div', 'pause-grid');
    [['bag', '行囊'], ['char', '角色'], ['skills', '技能'], ['quests', '任务'], ['save', '存档'], ['help', '说明']].forEach(([k, label]) => {
      grid.appendChild(btn(label, '', () => G.ui.openPanel(k)));
    });
    body.appendChild(grid);
    const soundBtn = btn(G.ui.sound === false ? '音效：关' : '音效：开', '', () => {
      G.ui.sound = G.ui.sound === false ? true : false;
      if (G.ui.sound) G.sfxOn(); else G.sfxOff();
      G.ui.openPanel('pause');
    });
    body.appendChild(soundBtn);
    body.appendChild(btn('回到标题', 'danger wide', () => {
      G.saveGame('auto', G.game.st);
      G.game = null;
      $('panel').classList.remove('show');
      G.ui.showTitle();
    }));
    body.appendChild(btn('继续游戏', 'primary wide', () => {
      $('panel').classList.remove('show');
      if (G.game) G.game.paused = false;
    }));
  }

  /* ================= 死亡 / 结局 ================= */
  G.ui.showDeath = function () {
    const st = G.game.st;
    const d = $('modal');
    d.innerHTML = '';
    const card = el('div', 'modal-card');
    card.appendChild(el('h2', 'die-title', '你倒下了'));
    card.appendChild(el('p', '', '成长与进度都会保留。回到光明城，整备后再次出发。'));
    card.appendChild(el('p', 'dim', '死亡次数 ' + st.deaths + '　当前等级 ' + st.level));
    card.appendChild(btn('在光明城复活', 'primary wide', () => { G.respawn(); }));
    d.appendChild(card);
    d.classList.add('show');
  };

  G.ui.showVictory = function () {
    const st = G.game.st;
    const d = $('modal');
    d.innerHTML = '';
    const card = el('div', 'modal-card victory');
    card.appendChild(el('div', 'v-title', '魔君已被击败'));
    card.appendChild(el('p', '', '洛罕的双金牌重新合二为一，库斯伯特点燃了神坛之火。草原、雪原、沙漠与熔岩的幸存者们，第一次看见了没有阴影的清晨。'));
    const stats = el('div', 'v-stats');
    stats.innerHTML =
      '<div><b>' + Math.floor(st.playTime / 60) + '</b><span>分钟</span></div>' +
      '<div><b>' + st.level + '</b><span>等级</span></div>' +
      '<div><b>' + st.kills + '</b><span>击杀</span></div>' +
      '<div><b>' + st.deaths + '</b><span>死亡</span></div>' +
      '<div><b>' + G.QUESTS.filter(q => G.qState(st, q.id) === 'completed').length + '/24</b><span>主线</span></div>';
    card.appendChild(stats);
    card.appendChild(el('p', 'dim', '通关存档已写入自动存档。可以继续读取，把等级练满、把装备强化到顶。'));
    card.appendChild(btn('继续游荡', 'primary wide', () => {
      d.classList.remove('show');
      G.game.paused = false;
    }));
    card.appendChild(btn('回到标题', 'wide', () => {
      d.classList.remove('show');
      G.game = null;
      G.ui.showTitle();
    }));
    d.appendChild(card);
    d.classList.add('show');
  };

  G.ui.hideAll = function () {
    $('modal').classList.remove('show');
    $('panel').classList.remove('show');
    $('dialog').classList.remove('show');
  };

  /* ================= 输入 ================= */
  G.ui.bindTouch = function () {
    const cv = $('game');
    let joy = null;
    const R = () => cv.getBoundingClientRect();

    cv.addEventListener('pointerdown', e => {
      if (!G.game || G.game.paused) return;
      const r = R();
      if (e.clientX - r.left > r.width * 0.52) return;
      joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      cv.setPointerCapture(e.pointerId);
      G.ui.joy = joy;
      e.preventDefault();
    }, { passive: false });

    cv.addEventListener('pointermove', e => {
      if (!joy || joy.id !== e.pointerId) return;
      joy.x = e.clientX; joy.y = e.clientY;
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
      const max = 58;
      const d = Math.hypot(dx, dy);
      const k = d > max ? max / d : 1;
      G.input.mx = (dx * k) / max;
      G.input.my = (dy * k) / max;
      e.preventDefault();
    }, { passive: false });

    const end = e => {
      if (joy && joy.id === e.pointerId) {
        joy = null; G.ui.joy = null;
        G.input.mx = 0; G.input.my = 0;
      }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    // 攻击长按
    const atk = $('btnAtk');
    let atkTimer = null;
    const startAtk = e => {
      e.preventDefault();
      if (!G.game || G.game.paused) return;
      G.playerAttack();
      clearInterval(atkTimer);
      atkTimer = setInterval(() => { if (G.game && !G.game.paused) G.playerAttack(); }, 380);
      atk.classList.add('press');
    };
    const endAtk = () => { clearInterval(atkTimer); atk.classList.remove('press'); };
    atk.addEventListener('pointerdown', startAtk, { passive: false });
    atk.addEventListener('pointerup', endAtk);
    atk.addEventListener('pointercancel', endAtk);
    atk.addEventListener('pointerleave', endAtk);

    [0, 1, 2, 3].forEach(i => {
      const b = $('sk' + i);
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!G.game || G.game.paused) return;
        G.castSkill(i);
        b.classList.add('press');
        setTimeout(() => b.classList.remove('press'), 120);
      }, { passive: false });
    });

    ['btnHp', 'btnMp'].forEach(id => {
      $(id).addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!G.game || G.game.paused) return;
        G.usePotion(id === 'btnHp' ? 'red_potion' : 'blue_potion');
      }, { passive: false });
    });

    $('btnAction').addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!G.game || G.game.paused) return;
      G.interact();
    }, { passive: false });

    ['btnBag', 'btnChar', 'btnQuest', 'btnMenu'].forEach(id => {
      $(id).addEventListener('click', e => {
        e.stopPropagation();
        if (!G.game) return;
        const map = { btnBag: 'bag', btnChar: 'char', btnQuest: 'quests', btnMenu: 'pause' };
        G.ui.openPanel(map[id]);
      });
    });
  };

  G.ui.bindKeys = function () {
    const keys = {};
    window.addEventListener('keydown', e => {
      if (!G.game) return;
      const k = e.key.toLowerCase();
      if (keys[k]) return;
      keys[k] = true;
      if (k === 'w' || k === 'arrowup') G.input.my = -1;
      else if (k === 's' || k === 'arrowdown') G.input.my = 1;
      else if (k === 'a' || k === 'arrowleft') G.input.mx = -1;
      else if (k === 'd' || k === 'arrowright') G.input.mx = 1;
      else if (k === 'j') G.playerAttack();
      else if (k === ' ') { G.interact(); e.preventDefault(); }
      else if (k === 'q') G.usePotion('red_potion');
      else if (k === 'e') G.usePotion('blue_potion');
      else if (['1', '2', '3', '4'].includes(k)) G.castSkill(parseInt(k) - 1);
      else if (k === 'escape') G.ui.openPanel('pause');
      else if (k === 'b') G.ui.openPanel('bag');
      else if (k === 'c') G.ui.openPanel('char');
    });
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      keys[k] = false;
      if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        G.input.mx = 0; G.input.my = 0;
      }
    });
  };

  /* ================= 摇杆绘制（HUD 层，屏幕坐标） ================= */
  G.ui.drawJoystick = function () {
    const cv = $('game'), ctx = G.R.ctx, dpr = G.R.dpr;
    if (!G.game || G.game.paused) return;
    const joy = G.ui.joy;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = joy ? joy.ox - cv.getBoundingClientRect().left : 96;
    const oy = joy ? joy.oy - cv.getBoundingClientRect().top : G.R.ch - 96;
    const dx = joy ? G.input.mx * 58 : 0, dy = joy ? G.input.my * 58 : 0;
    ctx.globalAlpha = joy ? 0.9 : 0.36;
    ctx.strokeStyle = 'rgba(255,240,214,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, 56, 0, 6.284); ctx.stroke();
    const g = ctx.createRadialGradient(ox, oy, 4, ox, oy, 56);
    g.addColorStop(0, 'rgba(255,240,214,0.10)');
    g.addColorStop(1, 'rgba(255,240,214,0.02)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ox, oy, 56, 0, 6.284); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,214,0.55)';
    ctx.beginPath(); ctx.arc(ox + dx, oy + dy, 24, 0, 6.284); ctx.fill();
    ctx.fillStyle = 'rgba(40,30,20,0.5)';
    ctx.beginPath(); ctx.arc(ox + dx, oy + dy, 8, 0, 6.284); ctx.fill();
    ctx.restore();
  };
})();
