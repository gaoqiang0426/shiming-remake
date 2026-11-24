/* 使命 · 安卓复刻 — 主循环 */
(function () {
  'use strict';
  const G = window.G;

  function boot() {
    const canvas = document.getElementById('game');
    G.R.init(canvas);
    G.R.resize();
    G.ui.init();

    let last = performance.now();
    function loop(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      try {
        if (G.game) {
          G.update(dt);
          G.R.draw(dt);
          G.ui.tickHud();
          G.ui.drawJoystick();
        } else {
          // 标题背景：静态渐变即可
          const ctx = G.R.ctx;
          ctx.setTransform(G.R.dpr, 0, 0, G.R.dpr, 0, 0);
          ctx.clearRect(0, 0, G.R.cw, G.R.ch);
        }
      } catch (err) {
        console.error(err);
        window.__lastError = err;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // 首次交互解锁音频
    const unlock = () => {
      try {
        const a = new (window.AudioContext || window.webkitAudioContext)();
        if (a.state === 'suspended') a.resume();
        a.close && a.close();
      } catch (e) { }
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.game && !G.game.paused) {
        G.saveGame('auto', G.game.st);
      }
    });

    // PWA 离线缓存（仅在 http/https 下注册）
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
