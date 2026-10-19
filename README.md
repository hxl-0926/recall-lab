# Recall Lab

**把课程笔记变成可追溯的复习卡片，每天在终端里做五分钟主动回忆。** Grounded study cards and an inspectable SQLite review scheduler.

Node.js **22.14+**，零第三方依赖。默认从笔记的 `{{答案}}` 标记生成挖空卡；可选用 Ollama 生成问答卡，并核对答案是否出现在引用的原文行中。核心重点是把生成、证据、复习调度和可靠存储连起来。

## 快速开始

```sh
git clone https://github.com/hxl-0926/recall-lab.git
cd recall-lab
node src/cli.mjs import learning.db examples/learning.md
node src/cli.mjs study learning.db
node src/cli.mjs stats learning.db
npm test
```

无需 `npm install`。Node 22 可能打印内置 SQLite 的实验性提示，数据库仍可正常使用。内置模块说明见 [Node.js SQLite 文档](https://nodejs.org/download/release/v22.14.0/docs/api/sqlite.html)。

复习时先显示问题，按 Enter 才翻面；看到答案和来源后评分：`0` 重来、`1` 困难、`2` 正常、`3` 简单。输入 `q` 退出。一次最多取 20 张已到期卡片，重来卡十分钟后再出现。

## 写自己的笔记

```md
- SQLite 的一组写入全部完成或全部撤销，称为 {{原子性}}。
- 防止同一次请求重复生效可使用 {{幂等键}}。
```

```sh
node src/cli.mjs import learning.db my-notes.md
node src/cli.mjs due learning.db
node src/cli.mjs export learning.db
```

同一来源、问题和答案生成相同 ID，重复导入不会重置进度。内容变化会生成新卡，旧卡仍保留；当前无自动删除或合并。来源使用相对当前目录的文件路径，请从固定项目目录运行，避免移动文件后重复导入。JSON 导出包含所有卡片及复习事件，可重定向保存作数据分析；当前未实现 JSON 恢复导入，完整备份请在程序退出后复制数据库文件。

## 可选：从普通笔记生成卡片

安装并启动 Ollama，下载合适模型后替换名称：

```sh
node src/cli.mjs import learning.db my-notes.md --model YOUR_MODEL
```

适配器按 [Ollama API](https://docs.ollama.com/api/generate) 请求 JSON，要求答案是来源某一行的原文子串，写入前进行确定性校验。所有卡片必须通过校验才能导入，失败不留下半批数据。生成模式使用本地默认端点 `http://127.0.0.1:11434`。当前环境只验证了模拟 HTTP 集成，未运行真实本地模型。

原文包含答案只能保证来源对应，不能保证题目唯一、答案正确或卡片适合学习。请查看导入预览和复习时的原文。本工具不自动判断你是否掌握知识，由你评分。

## 工程设计

| 能力 | 实现与用途 |
| --- | --- |
| 来源可追溯 | 每张卡保存文件、行号与证据文本 |
| 重试安全 | 每次评分带独立 `eventId`，重放同一事件不会再次调度 |
| 并发保护 | `expectedVersion` 拒绝从过期卡片状态提交的评分 |
| 原子提交 | `BEGIN IMMEDIATE` 同时更新卡片与追加复习事件 |
| 审计与分析 | 事件保存评分前后状态，可导出为 JSON |
| 可解释调度 | 简化的 SM-2 风格算法，失败 10 分钟；正常前两次为 1、3 天 |

这不是 FSRS，也未根据真实学习数据拟合。间隔是固定小时数的倍数，不是本地日历日期，夏令时跨日可能改变显示时间。程序保存 epoch 毫秒，展示时使用操作系统时区。

`npm test` 覆盖调度、证据校验、重复导入、事件重放、版本冲突、事务回滚和持久化。CI 配置覆盖 Windows/Linux、Node 22/24，运行结果以 Actions 为准。

继续阅读 [学习路线](docs/LEARNING.md)。MIT License；初始实现有 AI 协助。示例只含合成笔记，请不要提交自己的学习数据库或私密笔记。
