# AGENTS.md - KET 单词大冒险 v5

## 项目概览

这是一个使用原生 HTML/CSS/JavaScript 与 Express 静态服务的 KET 单词学习游戏。当前构建标识为 `ket-v5-srs-20260721`。

## 不可回退的关键约束

- 全量词库位于 `assets/cards-data-v5.json`，共 1629 条。
- 禁止恢复 `CARDS_DATA`、`js/cards-data.js` 或 `js/cards-data-v3.js`。
- `index.html` 必须先异步加载并校验 JSON 词库，再依序加载游戏脚本。
- 保留逐词记忆进度、每日固定 6 个新词、到期复习和旧存档迁移。
- 地图只按首次学会的不同词数推进，不能按答题次数推进。
- 保留全量卡牌图鉴、分页搜索、重复卡分解、三波战斗、钻石和一次性技能。

## 关键文件

- `index.html`：页面、基础游戏逻辑和启动加载器。
- `assets/cards-data-v5.json`：1629 张卡牌。
- `js/game-upgrades.js`：卡牌、任务、战斗、技能和 v5 存档。
- `js/learning-core.js`：间隔记忆纯逻辑。
- `js/learning-system.js`：每日计划、学习队列和界面覆盖层。
- `tests/learning-core.test.cjs`：学习规则自动化测试。
- `server/index.js`：Express 服务入口。

## 开发与验收

- 安装：`npm install`
- 启动：`npm start`
- 测试：`npm test`
- 每次部署必须核对构建标识和 `cards-data-v5.json?v=5-srs` 的线上请求，不可只验证本地地址。
