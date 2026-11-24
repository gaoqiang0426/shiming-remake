# tools

- `gen_data.py`：从 `_src/data/*.json` 生成 `../js/data.js`（改动内容数据后重跑）。
- `smoke.mjs`：全流程回归（新游戏 → 24 条主线全通 → 结局 + 30 张地图构建 + 战斗判定 + 截屏）。
- `ui-test.mjs`：界面交互（对话 / 商店购买 / 触控施法 / 存读档）。
- `i18n-check.mjs`：检查所有文本键是否都能解析成中文。
- `shots.mjs` / `desk.mjs`：各区域、竖屏、桌面尺寸截图。

运行前后需要本地静态服务：`python -m http.server 8765`，并安装测试依赖：`npm i playwright-core`。
