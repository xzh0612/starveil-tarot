# AICoding 架构设计 · 资料摘要

> 本文档做一件事：**精读主理人转交的全部原始资料，逐份、逐章节做出摘要**——后面任何人拿到这份摘要，都能通过章节号快速定位回原始文件的对应位置。
>
> 上游输入：主理人转交的全部原始资料（本批均为 Markdown 文档，共 11 份）；
> 产出者：`knowledge-ingest-engineer`（知识摄入工程师 - 闻资料），经 G1 校验与人工审核通过后交付。
>
> 本阶段整理目标：为「星幕塔罗 STARVEIL 网站当前痛点分析」提供结构化输入基线。因此逐章摘要时重点提取并归入：现状问题、已知限制、痛点、未达标项（P1/P2）、已知故障与踩坑、待决策项、技术债；功能诉求与技术约束同样保留。

---

## 0. 元信息

```yaml
标题: 星幕塔罗 STARVEIL - 资料摘要 v1.0
版本: v1.0
状态: Draft（待 G1 自动校验与人工审核）
创建日期: 2026-10-20
整理人: knowledge-ingest-engineer（闻资料）
审核人:
  - 齐构成（team-lead，主理人）

原始资料清单:
  - README.md: 项目总览：功能清单、架构（React→Vite→Python agent→DeepSeek）、本地运行、测试、设计边界
  - docs/rag-prompt-progress.md: RAG/Prompt 已完成能力说明：十大问题解法、版本号（rag-v55/prompt-v47）、当前限制与下一步
  - docs/ui-redesign-report.md: UI 重设计报告：表现层痛点、可拆分舞台方案、Agent 全链路审视、BM25 改进
  - docs/chat-ui-anatomy.md: WorkBuddy 聊天 UI 逆向解剖 + 全屏三栏/收起栏规格
  - docs/witch-3d-design.md: Nyx 女巫立体角色与动作设计 v2（含未实现项边界）
  - frontend/AGENTS.md: 原型指令与已确认用户方向（立绘 v3、弧形牌带等）
  - frontend/README.md: 第一版交互前端说明：可操作能力、明确边界、AI 接口契约
  - frontend/design-qa.md: 视觉与功能验收记录：比较修正历史、五项检查、仍未达到最终标准（P1/P2）
  - .workbuddy/memory/MEMORY.md: 项目长期记忆：技术栈迁移史（Node→Python agent）、已知故障、调参入口、push 踩坑
  - .workbuddy/memory/2026-10-20.md: 最近工作日志：证据门禁误拒三轮调试、agent 重启才生效、push 踩坑
  - .workbuddy/memory/2026-10-19.md: 对话面板改造日志：REA 逆向、全屏三栏、模型快切、语音输入
```

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.0 | 2026-10-20 | `knowledge-ingest-engineer` | 初稿：D1–D11 逐章摘要、8 条冲突并列记录、硬指标自检 |

---

## 1. 资料清单

> 列出全部原始资料，每份标注解析状态。解析失败或跳过的必须注明原因。

| 编号 | 文件名 | 类型 | 来源 | 解析状态 | 说明 |
| --- | --- | --- | --- | --- | --- |
| D1 | README.md | md | 项目仓库根目录（仓库自述） | 已解析 | 项目总览：功能、架构、运行、测试、设计边界 |
| D2 | docs/rag-prompt-progress.md | md | 项目文档（注明只保存本地、不提交 GitHub） | 已解析 | RAG/Prompt 已完成能力与十大问题解法 |
| D3 | docs/ui-redesign-report.md | md | 项目文档（注明不修改业务代码、不提交 GitHub） | 已解析 | UI 重设计方案与 Agent 全链路审视 |
| D4 | docs/chat-ui-anatomy.md | md | 项目文档（REA 逆向产物整理） | 已解析 | WorkBuddy 聊天 UI 解剖与三栏规格 |
| D5 | docs/witch-3d-design.md | md | 项目文档（角色设计稿） | 已解析 | Nyx 女巫立体角色与动作设计 v2 |
| D6 | frontend/AGENTS.md | md | 项目仓库（原型指令） | 已解析 | 已确认用户方向与工程约束 |
| D7 | frontend/README.md | md | 项目仓库（前端说明） | 已解析 | 第一版交互前端能力、边界与 AI 接口契约 |
| D8 | frontend/design-qa.md | md | 项目仓库（验收记录） | 已解析 | 第一版视觉与功能验收，含 P1/P2 未达标项 |
| D9 | .workbuddy/memory/MEMORY.md | md | 项目长期记忆 | 已解析 | 技术栈迁移史、已知故障、契约常量、踩坑 |
| D10 | .workbuddy/memory/2026-10-20.md | md | 项目工作日志（2026-10-20） | 已解析 | 证据门禁三轮调试、agent 重启才生效、push 踩坑 |
| D11 | .workbuddy/memory/2026-10-19.md | md | 项目工作日志（2026-10-19） | 已解析 | REA 逆向、全屏三栏、模型快切、语音输入 |

**类型说明**：本批 11 份资料全部为 Markdown（`md`）文档，均位于项目仓库内，由 Read 工具直接解析成功，无解析失败或跳过项；模板中枚举的 `docx` / `pdf` / `pptx` / `xlsx` 类型本批未出现（见附录 B）。

---

## 2. 资料内容摘要

> 逐份文档按自身章节结构做摘要。每条摘要标注章节号（`D编号，§章节`），后面任何人想核实某个点，直接定位回原文对应位置即可。

### D1：`README.md`（项目根 README）

> 星幕塔罗 STARVEIL 项目总览：全屏单页私人塔罗体验，DeepSeek 按固定韦特牌义解读并保存可回看牌局 — 来源：项目仓库根目录

| 章节 | 内容摘要 |
| --- | --- |
| §功能 | 问题驱动牌阵推荐（先输入问题，给出 2–3 个适合牌阵与推荐理由，用户确认后使用）；10 类牌阵（单牌、三牌、时间之流、两条道路、关系之镜、事业之径、马蹄、凯尔特十字、十二月轮、自定义）；78 张固定牌面以桌面弧形牌带呈现（拖动/滚轮/键盘/滑杆浏览，悬停抬牌、点击抽取、随后翻牌）；78 张中文正位/逆位/关系/事业/反思解读与牌义图鉴；DeepSeek 多轮对话式解读（沿用本次牌局不重新抽牌）；对话面板可切换全屏三栏（左历史对话点击直切、切走前自动存档当前对话，中聊天，右本局牌面；左右两栏可单独收起成 52px 竖边条，选择记本机）；模型快速切换 deepseek-flash / deepseek-chat，写入 .env.local 后对运行中服务热生效；语音输入（Chrome/Edge 浏览器语音识别转文字追加输入框，不支持或无权限时提示）；解读反馈标记（本机标记「有帮助/需要复核」，随档案导出但不发送给模型）；动态插画书房（紫色绒面牌桌、烛光、星尘、衣料流光、抬眼/低头视线状态）；本地档案、后记、个人知识库、JSON 导出、原创循环 BGM（D1，§功能） |
| §架构 | 浏览器 React 单页 → Vite（把 /api/* 反向代理到本机 agent）→ Python 解读服务（FastAPI + uvicorn，监听 127.0.0.1:8787）→ DeepSeek API。解读 agent 最初是挂在 Vite 上的 Node ESM 中间件，现已迁移为独立 Python 服务 frontend/backend/；迁移前实现原样保留在 frontend/server-js-reference/，继续作为离线评估和逐条行为对照参考。浏览器始终只与一个源通信（D1，§架构） |
| §本地运行 | 需要 Node 22+ 与 Python 3.13；dev:all 同时拉起解读 agent 与 Vite dev server 并互相守护（任一退出整体退出），打开 localhost:5173。【常见故障】只跑 npm run dev 时 /api/readings/interpret 拿不到服务（代理返回 500），前端显示「解读服务暂时未连接。牌面已保留」——遇到该提示基本即 agent 没在跑；服务起来后也可在对话面板引导卡里配置密钥不用改文件。生产构建 npm run build；本地预览 npm run preview（同样需要 agent 在跑才会解读）（D1，§本地运行） |
| §DeepSeek 配置 | 密钥只能放在 DEEPSEEK_API_KEY 里由 Python agent 读取，不要加 VITE_ 前缀（带该前缀会被内联进浏览器产物）【安全约束】；STARVEIL_AGENT_PORT 可改 agent 端口（默认 8787），Vite 代理目标跟着走；无密钥时 agent 仍启动但解读接口返回 provider_not_configured；密钥来自启动环境变量时界面显示「由环境变量提供」并锁定编辑。agent 提供五个只允许本机调用的接口：POST /api/readings/interpret、POST /api/spreads/recommend、GET /api/readings/status、GET/POST/DELETE /api/readings/config（仅接受 loopback 来源，校验 Host 白名单防 DNS rebinding，密钥永不回显）、POST /api/readings/debug。接口校验牌面、正逆位、请求大小、来源、并发和超时；首轮模型输出必须逐牌引用固定牌义、正文与合读与证据相符、核心锚点完成合读、行动建议提供证据、advice/comparison 目标有 application 证据时每条行动引用对应 application、拒绝「保证一定会」类绝对预测；健康/法律/投资高风险问题必须含现实依据边界；只有主题和回答目标都开放的问题才先进入只提一个具体问题的澄清分支；已明确多个目标的 mixed 问题直接按目标分段回答；JSON 结构偶发不合约时后端最多自动修复一次并重新校验；档案与个人知识库不会自动发送给模型（D1，§DeepSeek 配置） |
| §测试 | npm run test:agent（Python agent，312 个用例）；前端 node --test tests/*.test.mjs（34 个用例）。【CI 覆盖缺口】GitHub Actions 只在 frontend/ 下执行锁定依赖安装、Sites 生产构建、前端 Node 测试、离线 RAG/Prompt 评估和高危依赖审计，不读取 DeepSeek 密钥；CI 目前只覆盖前端 Node 测试与 server-js-reference/ 的离线评估，Python agent 的 312 个 pytest 用例需在本地运行 npm run test:agent。RAG/Prompt 离线质量门：eval:reading（对照 Node 参考实现）与 eval:reading:py（直接跑 Python agent）。质量门详列（Prompt v47 / RAG v55）：证据主题覆盖、逐牌覆盖、核心锚点、正文/行动正文/行动理由的证据支持、引用合法性、可执行建议、首轮与追问轮次覆盖不足边界、选择型问题决策应用召回、「哪条/哪种」及「要不要/该不该」比较目标路由、「能不能/有没有机会」预测目标路由、否定意图短语不误触发目标路由、目标路由评估覆盖 advice/forecast/explanation/comparison 且检查额外误路由、混合主题不混入无关应用域、单目标不混入未路由 goalSections、目标化 responsePlan、按目标生成的 directAnswer 开场框架与 actionGuidance 行动约束、首轮先直接回应当前问题再按目标展开、混合问题 goalPlan 逐目标顺序、goalSections 分段顺序与证据绑定、已路由目标层级引用（建议必须有 application 证据，首轮每条行动建议在 application 可用时也必须引用对应目标证据）、目标证据覆盖诊断与按四目标写明缺失层级的覆盖不足边界、大牌阵动态证据预算、按牌位目标层级预留、紧预算下先保留牌位语义证据再预留目标证据、混合目标按牌位轮转预留、未来-only 问题保留牌位应用语义、显式预算先保留目标层、按分数预留目标证据、弱代词与上下文追问的原始主题继承、当前目标覆盖旧目标、追问目标路由传入证据检索、离线评估复用目标证据层级、具体引用词校验、引用 claim 逐句证据校验、绝对断言校准（覆盖全部用户可见字段）、确定时间预测校准（拒绝把日期写成必然结果，允许把时间范围用于观察或核验动作）、澄清分支边界（不伪造 fallback 引用）、明确 mixed 目标不被无谓澄清、模型证据与检索诊断隔离、牌阵推荐理由必须引用目录牌位概念并与用户问题主题相连、结构化追问正文证据支持、纯文本追问必须命中具体证据、结构化追问必须引用当前目标层级、目标分段作为追问正文证据来源、牌阵位置语义命中与诊断字段、首轮逐牌解读对可用牌位证据的引用约束、行动正文与理由证据支持（正文和理由必须命中非通用牌面概念）、顶层正文证据支持、首轮正文引用范围约束、单目标目标分段证据支持、首轮目标分段层级约束、目标分段层级修复指引、目标化覆盖边界修复指引、结构化 grounding 修复指引、共享目标证据层级契约、逐句逐分句结构化正文证据约束、混合主题逐域覆盖诊断、按牌位目标证据缺口诊断、混合目标顶层摘要覆盖与紧预算按牌位预留证据槽位。当前 Python agent 侧共 312 个 pytest 用例（前端另有 29 个 Node 用例——同一文件 §测试 节写作 34 个，见 §3 冲突 X2）。本轮新增 activeQuestion 相关性门禁：问题明确落在关系/事业/自我主题时顶层回答必须覆盖每个明确主题并为每个主题复述至少一个同域词，答非所问的泛化文本标记 question_relevance 并进入一次有边界修复流程；response goal 门禁：advice/forecast/explanation/comparison 及混合目标分段必须使用对应回答模式（预测必须同时出现趋势线索和现实核验边界，解释需说明原因或牌面线索），不匹配返回 goal_alignment 并进入一次有边界修复；目标层级证据必须落到顶层正文（存在可用 requiredEvidenceTier 时正文要复述该层级具体概念）；比较目标必须在正文点出至少一侧或一个选项并写出条件、代价或取舍；涉及「他真实想法」「她是否在乎」等他人内心问题额外要求 uncertainty 明确写出牌面不可验证内心并把核验落到沟通、现实互动或可观察行为；追问质量门禁：followUp 必须是与当前问题或目标相关的具体单问句，泛泛提问与连续多问返回 followup_question 并进入一次有边界修复。RAG v55 在 v49 的通用解释证据隔离、个人记忆短词保护、口语比较、因果路由和 perspective boundary 之外，补齐胸口疼、头疼、停药、换药、起诉、买房、睡眠不足等口语高风险表达的现实边界；普通「焦虑/辞职」仍不会被自动扩大为专业风险；「他到底在想什么」等第三人称内心状态口语统一纳入 perspective boundary；v52 将个人记忆召回方法名抽成共享契约常量防 Prompt 与检索器漂移；问题级专业边界与 action 级门禁共同覆盖买房、购房、合同、上诉、仲裁和离婚等决定。Prompt v47 在 v44 开放目标门禁之外覆盖「有戏、有没有机会、有没有结果、对方有没有感觉」等口语化结果预测：首轮 responsePlan.goal=open 且不允许澄清时只能给核心牌面线索、现实观察和用户可控制的记录动作，不能擅自输出结果预测或他人内心判断；解析器与离线评估返回稳定 open_goal_prediction 代码并触发一次有边界修复；高风险 action 仍必须先安排核实现实资料、评估风险或咨询合格专业人士；Prompt 总字符预算约 56,000，大牌阵与长历史接近上限时服务端优先保留当前证据和最近一轮、只进一步压缩更早历史，并在 promptBudget.historyLimits 记录实际预算；单条过长历史采用开头加结尾压缩、省略标记隔开中段，避免丢掉末尾行动和边界信息（D1，§测试） |
| §目录 | frontend/src（React 页面、牌局状态、动态海报、弧形牌带）；frontend/backend（Python 解读 agent，FastAPI + uvicorn，端口 8787）；frontend/server-js-reference（迁移前 Node 实现与离线评估，行为对照）；frontend/public（78 张牌、背景、BGM、可选 GLB 资源）；frontend/tests（前端 Node 测试）；frontend/qa（浏览器验收记录与截图）；docs（设计与建模文档）（D1，§目录） |
| §设计边界 | 当前女巫使用统一场景插画的动态海报方案，不宣称骨骼 3D、连续口型或真实手指抓牌；旧版 Blender/GLB 模型保留在 frontend/public/models/ 并通过 LegacyScene.jsx 作为后续替换接口。塔罗解读用于自我反思，不读取他人内心，也不保证未来事件；涉及健康、法律或投资决定时应以现实信息和专业意见为依据（D1，§设计边界） |
| §来源与许可 | 牌图来源、原典资料、中文编辑方法和生成素材说明见 frontend/research/tarot/README.md 与 frontend/public/assets/generated-assets.md；牌图许可文件保留在 frontend/public/assets/cards/LICENSE.txt（D1，§来源与许可） |

### D2：`docs/rag-prompt-progress.md`（RAG 与 Prompt 已完成部分说明）

> 面向 RAG 新手的项目说明：记录当前代码已解决的问题、解决方式、代码例子和验证结果；文件注明只保存在本地，不提交 GitHub，也不参与当前分支发布 — 来源：项目文档

| 章节 | 内容摘要 |
| --- | --- |
| §1 系统一句话 | 用户问题不直接丢给 DeepSeek，而是经过可检查流程：问题路由（主题+目标）→ 检索固定牌义/牌位语义/参考资料/用户记忆 → 按预算整理证据 → 组装 Prompt → DeepSeek 返回结构化 JSON → 服务端解析、检查引用与安全边界 → 返回网页。三核心概念：RAG、Prompt、校验器（「模型说得通顺，不代表它一定有证据」）。当前版本号：固定牌义与 RAG = rws-1909-rag-v55；个人记忆检索 = memory-keyword-v3；Prompt 协议 = nyx-prompt-v47。主要代码文件列 frontend/server/reading-rag.mjs、readings.mjs 及三个测试文件、evaluate-reading.mjs（D2，§1） |
| §2 已完成能力 | 14 项：固定 78 张 RWS 牌义不随调用重新生成；每牌有正位/逆位/象征/关系/事业/问题引导字段；区分关系/事业/选择/未来/反思主题；区分建议/预测/解释/比较目标；每张抽出牌有核心牌义锚点 anchor；按牌位和问题补 application 层证据；外部资料只能补充不能覆盖固定牌义；用户记忆只调措辞和行动建议不变新牌义；历史对话限长；模型必须返回结构化 JSON 且服务端解析检查引用；识别「对方到底怎么想」类无法验证的内心推测并要求保持不确定性；识别停药/签合同/买房/投资/诉讼等高风险动作并要求现实核验或专业建议；混合问题拆成多个目标分别回答；有离线评测不依赖 DeepSeek 网络调用（D2，§2） |
| §3 问题一 编牌义 | 以前的问题：模型把不存在牌义当事实、不同网站说法混用、同牌含义漂移、随机性导致前后不一致——对固定牌组尤其危险。解决：固定牌义作为最高优先级 canonical_fixed 来源，启动时检查 78 张牌是否完整（validateReadingCorpus，缺字段直接抛错不让模型临时补写）；来源四类优先级表：fixed_card_meaning（权威）、external_reference（只能补充语境）、personal_memory（只调表达和行动建议）、other（不能直接当牌义）（D2，§3） |
| §4 问题二 检索混杂 | 以前的问题：用户问感情检索出大量事业语义；牌位语义不明显时模型只拿到通用牌义、回答空泛。解决：先路由再检索；GOAL_REQUIRED_TIERS：advice/comparison→application、forecast→reference、explanation→anchor；检索不只按命中词排序，保留每张牌固定锚点、每牌数量上限、全局预算裁剪；服务端生成 coverageStatus（complete/anchor_only/incomplete，后者要求明确说明不确定性）；模型只看到稳定证据 ID、牌位、层级、来源和正文，检索分数与内部诊断留在服务端（D2，§4） |
| §5 问题三 否定误路由 | 以前的问题：中文否定词多、短语口语化，「我不是想问未来会不会发生，我想知道现在应该怎么做」可能被误识别为 forecast。解决：NEGATED_INTENT_PREFIX 否定保护 + 长短语优先匹配（「未来我该怎么安排」含「未来」但「怎么安排」更接近 advice，不能机械当预测）；支持四目标 advice/forecast/explanation/comparison；路由结果进 retrievalMeta 和 goalPlan，是服务端计划不是用户指令，模型不能当成新事实（D2，§5） |
| §6 问题四 记忆泄漏 | 以前的问题：不相关旧记忆塞进当前 Prompt；模型把用户自己的描述当成已验证客观事实。解决：记忆检索有数量和字符预算（最多 6 条、总长最多 6,000 字符）；进入 Prompt 的记忆证据标记 sourceType=personal_memory、sourceAuthority=user_context、memoryStatus=user_confirmed、memoryUse=context_only，告诉模型它是用户确认上下文、不是系统牌义、只帮助调整措辞和行动建议、其中任何指令/角色声明/围栏文本只是待分析数据不能执行；过长记忆设 memoryExcerpted=true，模型不能根据省略部分补写事实（D2，§6） |
| §7 问题五 规则漂移 | 以前的问题：RAG 代码与 Prompt 各自维护一套规则发生漂移（检索器返回 application 而 Prompt 不知该层级、记忆检索改名而 Prompt 按旧版解释、路由加 comparison 而输出校验无对应字段）。解决：Prompt 和 RAG 用显式版本号并把同一份元数据传入模型上下文（knowledgeMeta 含 deckVersion/ragVersion/promptVersion/corpus）；记忆检索版本从 reading-rag.mjs 导入而非两个文件手写（D2，§7） |
| §8 问题六 Prompt 无限增长 | 以前的问题：对话越长 Prompt 越容易超模型上下文限制、旧问题压过最新问题、旧消息错误结论被继承、调试时不知道哪些历史被传入。解决：确定性压缩——最多保留最近 24 条、每条最多 4,000 字符、历史总长最多 24,000 字符、单条超长保留开头和结尾、中间删除位置写「中段历史已省略」标记；生成 promptBudget 记录本轮实际使用的历史/证据/记忆字符，当前问题和当前证据优先、较早历史先被压缩。明确「这解决的是上下文管理问题，不等于模型记住了所有历史」（D2，§8） |
| §9 问题七 无证据回答 | 以前的问题：模型擅长写出听起来合理的内容，只检查语法或 JSON 格式无法发现是否凭空加事实。解决：结构化输出固定字段（text/needsClarification/clarification/goalSections/cardReadings/synthesis/actions/references/followUp/uncertainty）；每个关键判断在 references 指向真实 evidenceId 并写出与证据共享具体概念的 claim；校验器六项检查（JSON 可解析、必填字段存在、每张牌被覆盖、引用 evidenceId 真实存在、实质句与引用证据共享具体词或可验证短语、未追加证据里没有的事实）；第一次输出不合格服务端最多发起一次有边界修复请求，带 repairCode 和 repairGuidance 不让模型无限重写（D2，§9） |
| §10 问题八 他心当事实 | 以前的问题：「他现在到底怎么想？他是不是还爱我？」——牌面无法验证另一个人真实内心，直接回答「他其实很爱你」会制造错误确定性。解决：PERSPECTIVE_RELATION_PATTERN 识别关系中的内心推测；命中后 Prompt 要求 uncertainty 明确说明牌面只能提供象征性观察角度、不能验证对方真实想法或感受、可通过沟通/现实互动/可观察行为核验（D2，§10） |
| §11 问题九 高危动作 | 以前的问题：用户把塔罗问题和真实决定混在一起（「我是不是应该停药？」「这个合同可以直接签吗？」「我现在应该买房或投资吗？」），模型只追求给答案可能直接给出不可逆行动。解决：识别停药、换药、买房、合同、起诉、贷款、投资、保险等高风险词；命中后回答必须明确塔罗不能替代医生/律师/持牌金融专业人士、把牌面写成反思和风险提示、把行动改成现实核验（阅读合同、咨询医生、核对费用和退出条件）、不能直接输出「现在就签」「马上停药」「一定买入」；服务端还拦截「保证一定会」「绝对会发生」类绝对预测和没有依据的确定日期（D2，§11） |
| §12 问题十 多目标 | 典型例子「为什么我们会变成这样？接下来我该怎么沟通？」至少含 explanation + advice 两个目标。解决：服务端建立 goalPlan 保存每个目标对应的证据和回答顺序；混合问题必须输出多个 goalSections，每个目标一段且每段只能用对应目标的证据；回答顺序：解释先用 anchor 说明牌面线索和可能原因，建议再用 application 落到用户能控制的沟通动作（D2，§12） |
| §13 完整例子 | 「他对我现在是什么态度？我下一步该怎么沟通？」七步处理：路由关系主题 → 混合目标 explanation+advice → 命中「对方态度」启用内心推测边界 → 每张牌先保留 anchor 再为目标找证据 → Prompt 禁止声称知道对方内心 → 两个 goalSections 先解释后建议 → 输出校验。一个合格的回答方向参考：从牌面象征看当前互动可能呈现犹豫或防御线索，但牌面不能验证对方真实的内心；要推进沟通可先提一个具体、低压力的问题，再根据对方是否回应、回应是否具体判断下一步（D2，§13） |
| §14 修改思路 | 改 RAG 的顺序：先定义新能力属于路由/检索/Prompt/输出校验哪一层；尽量只在对应层修改不把所有规则塞进 Prompt；新字段加稳定名字和版本说明；为正常例子、边界例子、反例加测试；跑离线评测确认原问题没退化。警告：不要只增加 Prompt 文字而不增加测试——「看上去规则变多了，实际却无法确认模型是否真的遵守」（D2，§14） |
| §15 当前限制和下一步 | 【限制】默认检索以确定性关键词和规则为主，没有强依赖向量数据库；语义 reranker 是可选接口，超时或不可用时回退到离线规则；固定牌义需人工维护，不能把网上资料自动当权威；塔罗解读仍是象征性解释，不能变成事实预测或专业诊断。【部署限制】公开部署时 DeepSeek API Key 必须放在服务端，GitHub Pages 这种纯静态站点不能安全代理付费 API。【待决策】未来多人使用应增加登录、用户隔离、后端数据库、配额和审计日志；未来加入向量检索仍要保留当前固定锚点、来源等级、证据预算和输出校验，不能只把关键词检索换成向量相似度。稳妥下一步顺序：更多真实问题离线评测集 → 维护固定牌义和外部参考来源记录 → 接入可选向量召回或 reranker 并与当前规则检索对比 → 最后考虑多用户后端和在线个人知识库（D2，§15） |
| §16 如何验证 | 命令：node --test frontend/tests/*.test.mjs、npm run eval:reading、npm run build、npm run audit。当前已验证结果：Node 测试 294 项通过；离线评测 prompt/retrieval/reading/followUp 均 100 分；Vite 构建通过（存在一个大 chunk 提示但不影响构建）；生产依赖审计 0 漏洞；最近一次 GitHub Actions 通过（D2，§16） |
| §17 新手阅读顺序 | 推荐顺序：版本号与 validateReadingCorpus → analyzeReadingQuestion 主题目标词 → retrieveReadingEvidence 的 anchor/application/reference/personal 区别 → retrieveMemoryEvidence 限量 → createPromptBudget → parseReadingOutput 与修复逻辑 → 三个测试文件。四问自测：固定牌义与用户记忆谁优先（固定牌义）；建议与预测检索层级差异（application vs reference）；为什么必须引用 evidenceId（检查回答是否有证据）；为什么「他爱不爱我」不能直接答成事实（牌面不能验证另一个人内心）（D2，§17） |
| §18 本轮改进记录（2026-09-22） | 18.1 个人知识库从「长期允许」拆成「本局允许」：旧调用链把 memories.filter(m => m.enabled) 直接传入解读请求，只回答「这条记录是否可以成为候选」没回答「用户是否允许本局读取」，追问旧牌局时个人信息可能无意进入 Prompt【已修痛点】；新增 session.usePersonalMemory 默认 false，UI 只有用户打开「本局使用我的知识库」后才发送 usePersonalMemory:true，services.js 负责传输，readings.mjs 服务端再次校验只有严格 true 才执行 retrieveMemoryEvidence——形成前端体验和后端安全两道门；服务端返回 memoryMeta（本局是否启用、候选数、实际召回数、检索版本）把权限和检索事实变成可观察数据。18.2 中文词法召回修正：新增 GENERIC_QUERY_TERMS 过滤「如何、怎么、怎样、是否」等只表达意图不表达主题的查询词，过滤发生在查询侧不改知识库正文也不改主题/目标路由；新增回归测试 retrieval does not treat generic question words as topical evidence。18.3 尚未完成的下一步：需要补充人工标注真实问题集，测量 Recall@k、目标层级覆盖、无关证据率和延迟；在保持本地词法基线情况下实验性加入 dense 召回并用 RRF 合并，而不是未经评测就替换现有检索；向量数据库、ColBERT、SPLADE、HyDE、GraphRAG 和大规模 ANN 索引目前都不应默认加入这个 78 张牌的小语料项目【明确不做清单】（D2，§18） |
| §19 BM25 全牌局统计（2026-09-22） | 旧版每张牌只用自己的候选 chunk 计算 BM25 IDF，统计范围过窄——一个词只要在当前牌某段落出现就被拿来和同牌其他段落比较，不知道它在整局其他牌/资料中是否也常见，「局部命中」容易被误认为「全局区分度高」【已修痛点】。现在 collectReadingEvidence() 先构造本轮所有合法牌的 globalCorpus 再给每张牌评分，诊断版本改为 bm25+rules+expansion-v2。没有删除固定锚点，也没让分数单独决定最终证据；锚点、牌位语义、目标层级和全局预算仍优先。新增测试验证多牌局使用全局候选语料，299 个全量测试和四项离线评测继续通过；真正的效果仍需后续人工标注集验证，不能只根据分数变化宣称召回质量已提升（D2，§19） |

### D3：`docs/ui-redesign-report.md`（UI 重设计报告）

> 目标：把当前「带动效的场景海报」升级成可以被操作、拆分、编排的 3D 占卜空间；只记录设计方案和实现边界，当前不修改业务代码，也不提交 GitHub — 来源：项目文档

| 章节 | 内容摘要 |
| --- | --- |
| §1 设计结论 | 已有基础：React、Three.js、78 张固定牌、牌阵、DeepSeek 解读、档案和真实 GLB 女巫模型。【表现层现状痛点】PosterScene.jsx 用两张场景图片配合 Shader 做局部流动，房间、桌子和人物并不是真正的空间对象；女巫 GLB 在 WitchStudio.jsx 可单独预览但没有成为占卜室主角；牌带是 CSS 绝对定位的图片，虽支持拖动但没有真实厚度、遮挡、桌面接触和光照；进入、抽牌、翻牌、解读和档案之间缺少连续的镜头、灯光和角色动作编排；面板打开后更像覆盖在背景上的窗口，而不是房间中的抽屉、书架或桌面物件。下一版采用「可拆分舞台」七层结构：场景容器 ├ 房间建筑层 ├ 光照层 ├ 女巫角色层 ├ 桌面层 ├ 牌组层 ├ 粒子层 └ UI 叠加层；每个对象有自己的位置、材质、动画通道、交互事件和可见性，背景只提供空间不再承担人物、桌子和所有动效（D3，§1） |
| §2 设计方向 | 2.1 视觉主题紫黑星象书房：不纯黑桌面、不大面积廉价紫色发光；色板表（夜幕底色 #080712、深紫木材 #1B1228、午夜紫 #2C173F、星象紫 #7150A8、烛火金 #F2B56B、羊皮纸 #E6D7D0、雾银 #B5A7C6）；紫色只负责空间气氛和状态提示，牌面保持 RWS 米白墨线复古色保证可读性。2.2 材质语言：墙面木柜高粗糙度 PBR 带微弱木纹法线；桌面深紫天鹅绒或磨砂木不用全黑纯色，用真实粗糙度接住牌和手的阴影；法袍半哑光布料、边缘金线单独材质、布料飘动由骨骼和轻量顶点偏移完成；牌面正面固定 RWS 图片、背面独立 3D 牌背材质、边缘薄金属倒角；UI 面板半透明羊皮纸和深色玻璃只用于小面积信息层；粒子用低亮度星尘和暖色火星避免整屏霓虹噪声（D3，§2） |
| §3 技术方案 | 3.1 保留 React + Vite + Three.js，不立即迁移另一套渲染框架（已有 Three.js、GLB 加载、动作预览和移动端降级逻辑，保留可降低风险）；推荐新增 src/scene3d/ 十模块（TarotStage/stage-assets/stage-cameras/stage-lights/witch-rig/card-rig/fan-deck-3d/particle-systems/stage-interaction/stage-performance）；业务层仍由 React 管理，Three.js 只负责舞台对象和动画，两层通过稳定事件协议连接（view=draw → 相机移动+女巫 Offer；selected → 卡片沿飞行轨迹进牌位；revealed → 卡片翻转+烛光短暂增强；panel=archive → 相机推书架+书本抽出；action=thinking → 女巫低头+法阵呼吸）。3.2 资产拆分：witch.glb 节点树（Root/Spine/Head/Hood/Cloak_Main/Cloak_Trim/左右 Arm/Hand/Jewelry/Eye_Glow）；room.glb、table.glb、cards.glb、props.glb 独立节点，实现「翻牌只动牌和手」「打开档案只动书架和镜头」「女巫说话只动头部和眼部」。3.3 女巫动作系统：十状态表（entry/sanctum/listening/thinking/shuffle/offer/drawing/reveal/speaking/archive，各含女巫动作与镜头灯光配合）；面部先保持遮挡和紫色眼睛的识别特征，后续再加眼睛、口型和表情，第一版必须确保动作即使没有面部动画也成立（D3，§3） |
| §4 页面和互动设计 | 4.1 入口两扇可独立旋转木门、门后 3D 书房、女巫远处半透明帷幔后出现；门缝星尘朝指针聚集、门把手暖色反光、点击沿真实铰链开门；无操作时低频运动不自动播放夸张剧情。4.2 问题输入是桌面羊皮纸卡片不是底部固定条；提交后羊皮纸沿桌面滑到女巫面前触发 listening；牌阵推荐以桌面三张浮动牌阵签展示。4.3 牌阵选择为有厚度签牌扇形；拖动桌面改顺序；确认后签牌收拢左侧、右侧出现「开始洗牌」。4.4 抽牌用 78 个独立 3D 卡片实例沿贝塞尔弧线分布，惯性与阻尼拖动，射线命中抬高倾斜，选中牌沿弧线离开经粒子轨迹落到牌位，已选牌留空隙，牌位有真实桌面阴影和布料接触。4.5 翻牌绕 Y 轴真实旋转，法阵只点亮与该牌位有关环节，卡面下方窄牌位标签不遮挡牌面，解读为悬浮羊皮纸不覆盖女巫和牌桌，可切换「逐牌/综合/下一步」，AI 输入在羊皮纸底部、回复时女巫头部手势同步变化。4.6 档案库为可漫游书架，历史占卜是有厚度书本，书脊悬停弹出、点击抽出翻开、搜索用书脊颜色和金色标签、删除导出备注在书页边缘小工具条。4.7 牌义图鉴三层抽屉卡匣（左抽屉/中 3D 卡匣/右立体放大）。4.8 知识库为桌面抽屉盒，每条记忆可编辑纸条、启用状态用小蜡封表示，记忆默认关闭、用户主动打开后才可能进入 RAG，UI 明确显示「仅作为上下文」（D3，§4） |
| §5 粒子系统设计 | 四个用途明确系统：星尘 StarDustSystem（4,000–8,000 个 InstancedBufferGeometry 粒子，固定 seed 避免刷新跳变，低速垂直漂移加噪声，指针局部吸引场，移动端自动降到 1,200–2,000）；烛火 CandleSystem（少量 billboard 粒子 + additive blending，点光源强度同曲线驱动保持火焰与桌面反光同步，翻牌只增强当前牌位附近不让整屏闪白）；烟雾 SmokeSystem（8–16 个半透明噪声 billboard 沿固定路径上升，对象池复用，只出现在香炉和蜡烛附近避免遮挡牌面文字）；法阵 RuneSystem（THREE.Line2 或自定义线段材质，按牌位逐段点亮，thinking 时 1.2 秒呼吸周期）（D3，§5） |
| §6 交互技术细节 | 命中与拖动用 THREE.Raycaster + pointer events 同一套事件协议；拖动不修改 DOM 的 top/left，只更新 3D 对象 transform 和 shader uniform；牌带移动用速度、阻尼和边界回弹三参数；所有可操作对象提供键盘焦点和文字提示不依赖鼠标。动画编排：每页面只暴露一个场景状态和一个动作时间线，时间线不散落在组件里（timelines 示例 draw/reveal），只描述事件不保存业务数据，业务状态仍由 React 管理保证刷新回放存档不被动画状态污染。相机系统三目标 visitor/table/archive，切换用带阻尼相机轨道不瞬移，用户可小范围自定义视角但不允许离开设计好的舞台边界（D3，§6） |
| §7 性能和降级 | 四档设备性能预算表：桌面高性能 8,000 粒子/2048 软阴影/Bloom+TAA/高精度 GLB；普通笔记本 4,000/1024 阴影/Bloom/压缩 GLB；手机 1,500/512 阴影/无或极弱 Bloom/低面数 GLB；prefers-reduced-motion 0–500 粒子/简化/关闭后处理/保留交互。实现要求：不给整张大背景图做持续位移；不在滚动容器上用大面积 backdrop-filter；粒子用实例化和对象池；GLB 用 Draco 或 Meshopt 压缩并按页面懒加载；页面隐藏时暂停渲染循环；所有动画只改 transform、材质 uniform、骨骼或透明度；WebGL 不可用时保留当前 CSS/图片降级模式，业务流程继续可用（D3，§7） |
| §8 视觉验收标准 | 第一版不以「截图好看」为完成标准，以八条可观察交互为标准：鼠标移动时至少三种独立对象响应（粒子、烛光、女巫或牌）；抽牌能看到单张牌从扇形离开、飞行、落位和阴影接触；翻牌时女巫的手、牌面和法阵有时间上的对应关系；切换档案/图鉴/知识库时空间中物件发生动作不能只出现 HTML 遮罩；用户关闭动效后布局和主要功能仍成立；手机端仍是单屏体验不要求上下滚动完成一次抽牌；所有牌面图案继续使用固定 78 张 RWS 资源不由模型随机生成；RAG、Prompt、DeepSeek 接口和现有数据存储不改变（D3，§8） |
| §9 实施顺序 | 四阶段可单独验收：阶段 A 舞台基础（房间/桌面/灯光/相机抽成独立 Three.js 节点，保留页面状态和降级模式，鼠标先影响星尘烛光相机视差）；阶段 B 女巫和牌桌（witch-v2.glb 放入真实牌桌空间，绑定 idle/listening/thinking/offer/drawing/reveal/speaking，双手和牌桌有接触阴影，修正「人物立在背景上」的感觉）；阶段 C 78 张 3D 牌带（FanDeck 从 CSS 换成 3D 实例，射线命中/惯性拖动/选中/飞行/落位/翻牌，牌面资源接现有固定牌组不改牌义和抽牌数据）；阶段 D 空间化 UI（牌阵推荐/解读/档案/图鉴/知识库做成桌面物件书架抽屉，时间线编排和粒子系统，按四档设备验收）（D3，§9） |
| §10 出图审验页面 | 六张横向界面图各展示一个真实页面状态（入口书房/问题与牌阵/78 张扇形抽牌/翻牌解读/档案书架/牌义图鉴与知识库）；设计稿存 docs/ui-redesign-boards/（01–06 六张 + contact-sheet）；【踩坑】图片生成服务本轮返回了 403，因此没有把不受项目资产约束的 AI 海报当作最终设计依据；图像用于确认方向，真正落地按对象拆分和状态协议实现，不会把整张图重新当背景贴回去（D3，§10） |
| §18 Agent 全链路审视 | 可控 Agent 五层：用户问题/历史/个人记录（数据）→ 问题路由+检索+证据预算（RAG）→ 结构化 Prompt 与输出契约 → 模型生成（Provider）→ 服务端解析、证据绑定、现实边界校验（Validator）→ 界面展示、反馈和下一轮状态（UI/Memory）。原设计已有固定牌义锚点、证据等级、Prompt 限长和输出校验是正确基础，但它把「用户允许某条记忆长期参与未来解读」和「本局解读允许读取个人知识库」混成了一件事——这是 Agent 设计中的权限边界问题，不是单纯 UI 问题。18.1 旧流程在 App.jsx 的 read() 中直接把所有 enabled 记忆发送给后端，enabled 只表示曾经允许作为候选资料不等于本轮允许，追问旧牌局时模型可能获得用户没有预期带入的个人信息，且单靠前端过滤不能构成安全边界；现在两道门：domain.js createSession() 把 usePersonalMemory 初始化为 false，App.jsx 只有当前牌局明确开启时才发送 usePersonalMemory:true 和候选，services.js 转发（此前只在调用方传入但服务适配器没转发，是容易被忽略的接口契约漏洞），readings.mjs 服务端再次校验布尔类型、usePersonalMemory !== true 时完全不执行个人记忆检索（防御性编程，即使绕过界面直接调接口也不会因提交 memories 字段自动启用）；memoryMeta 记录 enabled、候选数量、实际召回数量和检索版本。18.2 RAG 当前痛点：知识库只有 78 张固定牌及编辑牌义、Waite 资料和补充参考，规模很小，直接引入向量数据库并不能自动提高质量，反而会增加嵌入版本、索引同步、延迟、费用和调试难度；当前最合适路线仍是「规则路由 + 本地词法召回 + 证据层级 + 可选 reranker」而不是盲目堆技术。本轮具体问题：中文疑问词「如何、怎么、怎样、是否」能参与词法打分但只表达意图不表达主题（「未来会怎样发展？同时我该怎么安排下一步？」中「怎样」可能把反思段落分数抬高形成看似命中实际不说明主题的证据）；现加 GENERIC_QUERY_TERMS 只从直接主题词中排除这些泛化疑问词同时保留主题路由和目标扩展词；「不是删词越多越好」，如果把所有短词都删掉会伤害中文召回，所以只过滤经测试确认的意图词并限制在查询侧不改写知识库正文。18.3 市面检索技术取舍表：倒排/BM25（保留作基线）、元数据过滤（保留并加强）、Dense Embedding + ANN（可选第二路不默认开启）、Hybrid + RRF（未来接入优先 RRF 不直接线性相加）、Cross-encoder（候选 10—30 条可用需测延迟）、ColBERT/late interaction（语料太小收益不足暂缓）、SPLADE（与现有小语料词法扩展重复暂缓）、HyDE（可能放大塔罗预测偏差暂缓）、GraphRAG（当前没有稳定实体图暂缓）、HNSW/IVF（78 张牌不需要暂缓）；引用 Elastic hybrid search 与 Qdrant hybrid queries/reranking 佐证两阶段结构。升级顺序：先把评测集和词法基线做可靠 → 增加可关闭的 dense 召回 → RRF 合并 → 最后 reranker；每步必须在同一份 holdout 问题集上比较 Recall@k、目标层级覆盖率、无关证据率、延迟和 Prompt 字符数，不能因为某个单例问题改善就宣布 RAG 已完成。18.4 Prompt、工具和 Agent 边界：当前分工是 RAG 选什么证据、Prompt 怎样使用证据和遵守边界、模型组织自然语言、解析器拒绝无依据输出；历史消息、问题、个人记忆和模型返回都被当作不可信数据包围不应被当成新系统指令；当前项目没有让模型自由调用文件、网络或支付接口，这反而是合理的；工具一旦加入应先定义名称、参数 schema、权限、超时、重试次数、幂等性、审计字段和失败回退再接入，不能只给模型「万能工具」；个人知识库写入也应和读取分开并要求用户显式确认。18.5 可复现验证：新增并通过 domain/readings/services 测试 108 项与 reading-rag 测试 158 项；在没有 holdout 评测和真实接口验证之前，不把「测试通过」表述成「Agent 已经不需要改进」（D3，§18） |
| §19 第二轮 RAG 改进 | 19.1 旧实现 collectReadingEvidence() 调用 scoreChunk() 时把当前牌的 7 个 chunk 作为 BM25 corpus，IDF 参照范围太窄——一个词只要在当前牌某段落出现就被拿来和同牌其他段落比较，不知道是否在整局其他牌、其他资料中也很常见，结果是「局部命中」容易被误认为「全局区分度高」【已修痛点】；这不等于原 RAG 完全错误，锚点、牌位规则和主题过滤仍提供重要约束，问题主要出在词法分数的统计范围和诊断名称不够准确。19.2 改后先合成 globalCorpus 再传入每张牌 BM25 评分，召回方法版本从 bm25+rules+expansion-v1 更新为 bm25+rules+expansion-v2 并新增回归测试；收益：IDF 参照范围与本轮候选集合一致、常见词不会因局部段落出现获虚高分、诊断信息明确当前排序算法版本、仍保留 retrievalRequired 锚点/牌位命中/全局证据预算不会为 BM25 分数牺牲牌面覆盖；当前仍没把 78 张牌所有内容永久建成向量索引，因为项目语料小且需要可解释、可回滚；下一步用人工标注问题集验证全局 corpus 是否真的降低无关证据率，而不是只凭代码结构推断质量提升（D3，§19） |

### D4：`docs/chat-ui-anatomy.md`（WorkBuddy 聊天界面解剖）

> REA 逆向 WorkBuddy 桌面端聊天 UI（app.asar 内 lib-chat-ui JS/CSS），把类名与规则整理成星幕对话面板可照搬的结构与度量 — 来源：项目文档（2026-10-19 逆向，2026-10-20 追加）

| 章节 | 内容摘要 |
| --- | --- |
| §1 整体层级 | message-list-viewport（相对定位 flex 列）→ message-list（flex:1、overflow-y:auto、container-type:inline-size）→ message-list__content（max-width 100%、居中、padding-inline 16px）→ frame--left 助手回合（padding 16px 0、内容宽 100%、正文 13px）/ frame--right 用户回合（justify-end、padding-bottom 预留 28px hover 操作位）/ frame--center 系统事件（居中、12px、三级文字色）；回合之间无相邻选择器，间距完全由 frame 自身 padding 16px 0 提供（D4，§1） |
| §2 助手回合 | .cr-agent：flex 列；agent__header（flex、align-center、gap 10px、margin-bottom 12px）含 agent__logo（24×24 圆形、overflow hidden、border-radius 50%）与 agent__name（品牌字体、14px/600/1.75、主文字色）；下方为内容块（markdown / collapse / reasoning / tool-call 等）（D4，§2） |
| §3 用户回合 | .cr-self-message：flex、justify-end、gap 8px；self-bubble（width fit-content、max-width 100%、min-width 40px、padding 8px 12px、border-radius 16px 16px 0 16px、13px/19px、max-height 310px + 内部 4px 细滚动条）；气泡尾在右下角（BR=0）右上不对齐；--discarded 态 grayscale(1) + opacity .48（D4，§3） |
| §4 折叠系统 | .cr-collapse（步骤行/折叠行原型）：collapse__header（flex、width fit-content、gap 8px、line-height 1.75、三级文字色最弱档）；collapse__icon 收起时 rotate(-90deg) 且 opacity 0，header hover 才显形；collapse__content（height auto、interpolate-size allow-keywords、overflow hidden、contain layout paint、transition height .28s cubic-bezier(.33,1,.68,1) 与 opacity .2s）；content-inner 有 opacity + translateY(.28s) 过渡；reasoning 变体 header 15px，内容 border-left 4px 导轨 + padding-left 12px + margin 8px 0 4px + line-height 20px + max-height 200px（D4，§4） |
| §5 输入框 composer | input-box（flex 列、gap 12px、14px/1.5）→ input-container（position relative、flex 列、padding-top 12px、border 0.5px 发丝线、border-radius 24px、背景 elevated 面、输入框阴影）→ input-editor-host（min-height 64px、padding 0 16px、overflow-y auto）+ input-toolbar（flex、space-between、gap 8px、min-height 32px、padding 12px，左挂件按钮/chips 右 send-button）+ input-footer（flex、gap 4px、padding 0 12px、wrap chips 行）；--focused 只换阴影不变边框（发丝线常驻）；banner 贴容器上方共享边线（容器上圆角清零）；快捷操作条纵向 chips gap 8px；引用 chip border-radius 999px、padding 2px 4px 2px 10px、12px；send-button 32×32 正圆，--sending 降透明度、--stop 换停止色、:disabled 保持 opacity 1 只换 cursor（D4，§5） |
| §6 令牌值 | dark 主题实测令牌表：--cr-internal-bg-elevated #242629（输入框/浮层面）；--cr-internal-border-default #2a2c31（发丝边配 0.5px）；text-primary rgba(255,255,255,.92)、secondary .65、tertiary .45（折叠头/系统行）；--cr-internal-user-bubble-bg rgba(255,255,255,.1)（light 为 #f2f2f2）；--cr-md-root 16px（消息上下文被覆盖为 13px）、--cr-md-line-height 1.75；标题全部 em 相对值（h1=1.25em、weight 600、margin 20px 0 16px），首/尾子元素 margin 清零保证块拼接时间距恒定（D4，§6） |
| §7 值得照搬的细节 | 十条：0.5px 发丝边框配 #2a2c31 级深色；尾角气泡 16px 16px 0 16px 有指向感；折叠图标默认隐身（收起态 opacity 0，hover 才显形）；消息列表底部 72px 线性渐变 mask 内容自然消隐；用户回合下方预留 28px hover 操作位不抖动布局；时间戳 message-time-tip 默认透明 hover 才现；流式两件套文字流光 shimmer + 生成中块 opacity .7；细滚动条列表 6px/圆角 3px、气泡内 4px/圆角 2px、轨道全透明；prefers-reduced-motion 下所有过渡清零；message-list 挂 container-type:inline-size 容器查询窄栏自动收紧排版（D4，§7） |
| §8 与星幕暗紫主题映射 | 保留星幕自己的紫调配色与字体（不抄 WorkBuddy 中性灰），只移植结构与度量：正文 13px/1.75 同；气泡 8px 12px / 13-19px / 尾角同（底色用现有紫调）；输入框 24px 圆角 / 0.5px 发丝 / 64px 编辑区同；折叠头三级色 + 图标旋转淡出同；reasoning 左导轨 4px 同（用于解读谱系）；底部 72px 渐隐 mask 同；回合 padding 16px 0 同；系统行 12px 三级色居中同（D4，§8） |
| §9 全屏三栏（2026-10-19 追加） | WorkBuddy 历史列表属于 app shell 不在 lib-chat-ui 里，三栏是星幕组合方案只沿用聊天区度量：左栏 264px 历史对话（当前会话置顶、存档条目按时间倒序、点击直切，.chat-history/.chat-history-item）；中栏自适应复用同一套时间线与 composer（.chat-main）；右栏 300px 本局牌面（牌图 44px、牌名、牌位、正逆位、关键词，.chat-cards/.chat-card-item）；面板从 560px 抽屉扩展为 left/right 2% 整宽面板（.panel.chat.full），高度沿用 top 92px、bottom 18px；断点 ≤1180px 收右栏、≤900px 收左栏、中栏始终保留；切换会话前把当前未存档对话静默写入 history 避免直接切换丢失；模型快速切换与语音输入都放 composer 工具行不额外占版面（D4，§9） |
| §9.1 左右栏收起（2026-10-20 追加） | 两侧栏可单独收起，收起后保留 52px 竖边条点一下展开：展开 264px/1fr/300px（header 右侧收起按钮）；左收起 52px/1fr/300px（.chat-full.left-collapsed，竖条按钮「展开历史对话」）；右收起 264px/1fr/52px（.chat-full.right-collapsed，「展开本局牌面」）；都收起 52px/1fr/52px 各自独立恢复；列宽用 CSS 变量 --rail-l / --rail-r 驱动，媒体查询只改变量值因此窄屏下用户收起选择不被覆盖；收起状态存 starveil:chatRails（走 domain.js 的 load/save），刷新与重进面板都保持；竖边栏由 .chat-rail-expand 构成（图标在上、writing-mode vertical-rl 竖排标题、末尾条数）；【已修 bug】顺带修掉 .panel.chat .panel-body 缺少 flex:1 的问题——此前三栏高度只到内容高度，全屏面板底部留大片空白（D4，§9.1） |

### D5：`docs/witch-3d-design.md`（Nyx 女巫立体角色与动作设计 v2）

> 用户确认方向下的立体角色与动作设计：真实 3D 网格与模型、深紫星空兜帽法袍、默认遮面可抬头侧转看见眼睛与部分面部、保持全屏网页与固定 78 张牌 — 来源：项目文档（该方向后被 D6 的 v3 立绘方向取代，见 §3 冲突 X3）

| 章节 | 内容摘要 |
| --- | --- |
| 造型决策 | 采用「蒙面守夜人」：修长成年女性比例、重心稳定坐桌后；深葡萄紫外袍、灰紫内衬、少量旧银滚边与月牙胸针；轮廓由真实兜帽厚度、肩披、上身、层叠裙摆及钟形袖口构成；面部有头颅、鼻梁、眼眶、眼球与虹膜几何体，下半脸覆盖有曲面的不透明薄面纱。三候选路线取舍：全遮脸雕像缺少目光交流；完整写实裸脸需要更多面部雕刻、皮肤贴图与表情制作，容易初版违和；蒙面半露眼保持神秘感同时让头部朝向和眼睛具备可读性，故取第三条。头部参数：模型默认略低头兜帽遮上额；迎接抬头约 8–12°、倾听侧倾约 3–5°、思考向桌面低头约 8°、鼠标互动头部跟随限制左右约 12° 上下约 6°；眼睛先动头部延迟跟随；不持续盯随鼠标、不突然露出完整面孔（D5，§造型决策） |
| 模型结构与材质 | 头颈（立体头颅、鼻梁、眼球、虹膜、眼睑轮廓、眉部、耳侧轮廓，面纱独立建模预留替换完整面部接口）；衣服（裙摆纵向褶皱、收腰内袍、肩披、厚兜帽与内衬、左右袖子、袖口内壁，布料通过模型几何形成褶皱不能只画在平面上）；手（独立掌体、拇指与四指带关节，避免一块椭球充当整只手，抓牌将来按牌位驱动手腕目标）；首饰（银色月牙、领口袖口滚边，控制细节密度，面部与手是阅读焦点）。网页材质：真实粗糙度、金属度、法线与灯光响应；外袍偏粗糙内衬略柔亮，眼球少量反光虹膜不做激光式发光。【边界】当前不宣称具备皮肤次表面散射、实时布料或影视级毛发。骨架至少 Root/Spine/Chest/Neck/Head/左右 UpperArm/Forearm/Hand/手指关节；衣服与身体蒙皮绑定，装饰绑相应骨骼；动作以标准 GLB animation clips 输出保留 Blender 源文件；源文件 Blender Z-up 导出 GLB Y-up，模型正面朝网页 +Z（D5，§模型结构与材质） |
| 完整交互时序 | 九阶段动作表（大门打开进入占卜室：0–0.6s 低头、0.6–1.6s 缓慢抬头转向来访者、1.6–2.8s 右手轻抬示意再落回桌边，Greeting 单次随后 Idle；无操作停留：胸肩轻微呼吸手指缓慢放松头部不规则微转，完整循环约 6 秒；输入问题：微前倾侧头双手收拢目光转向用户，Listening 4 秒循环；等待解读：目光落向牌桌头部小幅偏转一手稍抬短暂停顿再落下，Thinking 4.8 秒循环，「不是假装已经理解问题」；洗牌过场：双前臂向中央聚拢左右手交替轻抬手指收曲，与现有 1.5 秒洗牌过场对齐；浏览 78 张牌：双手舒展后回桌边轻低头关注牌桌避免遮挡选牌区域，Offer 约 2.4 秒循环；点击一张牌：0–0.15s 准备、0.15–0.45s 手腕引导、0.45–0.62s 收回，Drawing 单次对齐抽牌飞行 620ms；翻牌：0–0.2s 抬腕、0.2–0.5s 掌面转开、0.5–0.7s 回中性位，Reveal 单次对齐翻牌 700ms；展示解读：抬头面对用户手掌缓缓打开轻点头后收手，Speaking 循环不作无声口型表演；阅读图鉴/历史：减少手势低头或轻侧转安静等待，面板不触发夸张表演；抬头观察：独立模型检查页可拖动旋转查看前/侧/背面与线框并选择动作；页面隐藏/减少动态：隐藏页面暂停更新，关闭动态时回归稳定姿势不在复杂动作中随机冻住）。状态优先级链：检查页手动动作 > 抽牌/翻牌短动作 > 洗牌 > 思考 > 说话 > 倾听 > 等待选牌 > 入场 > 待机；切换以 0.2–0.35 秒混合，不足一秒的动作用更短混合保留关键姿势，单次片段不无限循环（D5，§完整交互时序） |
| 接口与后续制作边界 | 运行时动作名九个：Idle/Greeting/Listening/Thinking/Shuffle/Offer/Drawing/Reveal/Speaking；每个片段必须在导出文件中实际存在，不能仅在配置中写名字就标记完成。预留接口：gazeTarget（眼睛/头世界坐标目标）、handTarget（牌位与左右手）、visemes（音素和时间戳）、expression（blink/focus/soften）、clothQuality、faceVariant。【未实现项边界】v2 不实现手部 IK、真实牌堆物理、实时布料、音素口型或完整写实面部表情；不得把未实现配置展示成可用功能。当前手指与手臂动画用于引导，DOM 卡牌仍保持原有身份和选择逻辑；后续精准抓牌需要将 DOM 牌位映射到 3D 桌面并用 IK 和附着/释放事件同步，而不是靠手势猜位置（D5，§接口与后续制作边界） |
| 验收方式 | 五条：GLB 实际包含蒙皮与骨架、9 个命名片段、各片段有非恒定骨骼关键帧；旋转到侧面和背面仍能看到兜帽、肩披、头部与身体体积，绝无人物图片平面替代；近看手部有分指、抬头可看到眼睛和鼻梁、面纱属于独立立体网格；网页使用同一个真实模型，提供待机/倾听/抽牌等动作检查入口，保留原始模型供比较不覆盖旧源文件；实际浏览器检查角色比例、手臂穿模、面部可读性、桌面遮挡和窄屏布局，报告已知精度差距，不能只靠导出成功声称美术完成（D5，§验收方式） |

### D6：`frontend/AGENTS.md`（原型指令与已确认用户方向）

> 原型工程指令与用户已确认方向清单（含多条带日期的方向更新与取代关系） — 来源：项目仓库 frontend/

| 章节 | 内容摘要 |
| --- | --- |
| Confirmed user direction（总则） | Web-only 全屏单页体验、无文档级滚动（长文本可在 reader panel 内滚）；Muted violet starry Gothic chamber、无脸女性兜帽女巫坐桌后、交互粒子、固定 78 张牌画；女巫用真实 3D 模型资产，第一版可物体级运动但保留 GLB 与命名动画接口供后续骨骼动画；桌面抽牌 6 行 × 13 列全部同时可见不重叠，窄屏重排 13 行 × 6 列（此条后被「Latest card selection」条取代，见 §3 冲突 X6）；用户授权资产生成、建模与实现并由用户审阅具体迭代，未经浏览器比较验证不得宣称概念图保真；自己跑本地服务器并在环境可用浏览器打开预览，不要把启动指令推给用户；视觉源不清或不再匹配当前目标时先用 Product Design 的 get-context skill；持久原型设计反馈/偏好/决策记入 AGENTS.md；从选定生成 mock 实现时把该图当作 layout、组件解剖、密度、间距、色彩、字体、可见内容与层级的唯一真相源（D6，§Confirmed user direction） |
| 2026-09-12 confirmed | 默认女巫替换为统一插画动态海报（女巫坐 visibly textured lavender velvet 桌后），本地头发/长袍运动与视线状态转换，保留旧模型归档（D6，§2026-09-12 confirmed） |
| Latest card selection | 最新选牌方向取代之前所有网格要求：78 张固定牌的重叠弧形水平扇带/牌带，拖动/滚轮浏览、悬停抬牌、点击抽到中央桌面；无全 78 卡片网格、无文档滚动（D6，§Latest card selection） |
| Latest user direction（supersedes Nyx v2） | 【与 D5 方向冲突，见 §3 冲突 X3】最新用户方向取代 Nyx v2：改用受精品王者荣耀宣传画启发的美丽青年女性插画角色；默认为 v3 动态立绘（银紫发、流动兜帽/长袍、局部布料运动与衣料粒子）；被拒的程序 3D 模型保持归档不作默认；诚实描述插画运动，不宣称骨骼面部动画或布料物理（D6，§Latest user direction） |
| Latest scene feedback | 保留已确认的女性身份与服饰，但改用坐姿腰部以上插画跨桌呈现；对话时面向观众视线，选牌/翻牌时向下视线，手休息位置靠近桌面；避免全身角色站在舞台上；前景桌面与姿势构图必须与 78 张牌和响应式布局一起检查（D6，§Latest scene feedback） |
| 工程约束（Sites 交接） | App UI 建在 src/；保持 .openai/hosting.json、worker/index.js、scripts/prepare-sites-build.mjs、tests/sites-worker.test.mjs 完整以便同一本地原型可交 Sites；Sites handoff 前跑 npm run build 与 npm run test:sites，构建必须留下 dist/client/index.html、dist/server/index.js、dist/.openai/hosting.json（D6，§工程约束） |

### D7：`frontend/README.md`（第一版交互前端说明）

> 星幕 STARVEIL 第一版交互前端：运行方式、测试、可操作能力、明确边界、女巫模型接口与 AI 接口契约 — 来源：项目仓库 frontend/

| 章节 | 内容摘要 |
| --- | --- |
| §运行 | 解读 agent 是独立 Python 服务 backend/，首次使用建 venv 装依赖；npm run dev:all 一条命令同时启动 agent 和前端，打开 localhost:5173；Vite 只把 /api/readings/* 和 /api/spreads/recommend 代理到 127.0.0.1:8787 上的 Python agent，其余路径行为和以前一致；也可分开启动（npm run agent 默认 8787；npm run dev -- --host 0.0.0.0 --port 4173 --strictPort）；生产构建 npm run build 不含 agent 只打包静态资源与 worker（D7，§运行） |
| §测试 | npm run test:agent（Python agent pytest）；npm run test:reference（原 JavaScript 参考实现测试 277 个，迁移期间保留）；node --test tests/*.test.mjs（前端测试）；RAG/Prompt 离线质量门 eval:reading:py（Python 现役）与 eval:reading（原 JS 参考实现，迁移期间保留）。质量门不调用付费模型，固定检查检索主题是否命中、每张牌是否有正逆位证据、首轮是否逐牌覆盖、引用是否来自本次证据集、回答是否包含可执行动作、system/user 消息是否保留证据边界和 JSON 输出约束；要回归一次真实模型输出可把响应 JSON 传给 evaluateReadingFixture，不需改动生产接口（D7，§测试） |
| §当前可操作能力 | 全屏单页十视图（开门、占卜室、牌阵、抽牌、翻牌、阅读面板、档案、图鉴、知识库、设置）；Three.js 真实 3D 圆桌、相机过渡和 1800 个深度粒子，粒子响应鼠标，卡牌悬浮与抽出/翻转动画。女巫默认改为原创年轻女性动态立绘 v3（银紫长发、法袍局部飘动、衣料流光和游动粒子），设置中「查看动态立绘」提供风力与暂停控制；先前程序 3D 模型保留为实验文件不再作默认角色。【技术债】Blender 原创程序模型 public/models/witch.blend 为源文件、witch.glb 为网页资产、scripts/create-witch.py 可重建；兜帽、法袍和双臂独立，现有动作是物体级姿态，不是骨骼蒙皮或布料物理。78 张固定 RWS 图案原图文件不变、统一牌背，桌面 6×13、窄屏 13×6，不在每次占卜时生成图片（此布局描述与 D1 弧形牌带冲突，见 §3 冲突 X6）。十种牌阵（单牌/三牌/时间流/两条道路/关系/事业/马蹄/凯尔特/十二月/1–12 张自定义），牌位语义生效；【P2 差距】复杂牌阵第一版以整齐卡片布局展示，尚未逐一做传统几何布局。Web Crypto 拒绝采样 + Fisher–Yates 洗牌：牌局先固定牌序、点击选择真实位置、无重复、留空位；逆位只旋转固定牌图；刷新可继续原牌局。78 张逐牌中文图鉴（图像象征、正逆位、关系、事业、反思问题、牌阵阅读方法、可展开英文原典），RAG 层按问题和牌位检索这些固定证据。追问 UI、存档回看、后记、JSON 导出、本人确认的知识记录。输入问题后先请求后端推荐 2–3 个牌阵；网络或服务不可用时自动切换到基于主题权重的本地推荐并明确标注来源。动作、粒子、合成轻音效、逆位设置；遵从系统减少动作偏好，隐藏标签页暂停渲染（D7，§当前可操作能力） |
| §明确边界 | 这是供修改的第一版前端。【P1 差距】当前女巫模型的雕刻、布料和手部精度与概念图仍有差距，不能宣称一模一样；背景保留概念图的拱窗与紫色星空美术，通过独立远景资产和实时模型组合。没有配置后端时解读会明确标记为本地牌义示例；配置后支持 DeepSeek 多轮追问。【未接入】补牌、语音、用户登录、云端数据库尚未接入（语音后续已实现，见 §3 冲突 X7）；【数据风险】所有记录存在当前浏览器，尚不支持导入、跨设备同步或自动备份（D7，§明确边界） |
| §女巫模型与动作接口 | src/services.js 的 witchModelConfig 配置资源地址与片段名，可设 VITE_WITCH_MODEL_URL 换入标准 GLB；Scene 接收 WitchAction（idle/listening/thinking/drawing/speaking 五值）与 SceneProps（view：entry/sanctum/shuffle/draw/reading；action；motion；particles；representation：cinematic|model；onStatus）；GLB 存在对应片段时用 AnimationMixer 并在 0.35 秒内交叉过渡，当前模型没有片段时使用呼吸、转向与手臂姿态；替换模型需保持米制、Y-up、面向 +Z、原点位于角色底部；模型创建脚本的 Blender Z-up 由 glTF 导出转换（D7，§女巫模型与动作接口） |
| §AI 接口 | 在 .env.local 设 VITE_READING_ENDPOINT 指向自己的后端（重启前端）；供应商密钥只能存后端。Request 类型：sessionId/question/deckVersion rws-1909-v1/spread/cards/messages/memories；Response：text/source ai/needsClarification/clarification/cardReadings/references/followUp/uncertainty/evidenceMeta.coverageStatus；ErrorResponse 错误码枚举 provider_auth/provider_balance/provider_busy/provider_timeout/provider_not_configured/provider_empty/provider_unavailable/rate_limited/card_reading_support/synthesis_support/missing_synthesis_anchor/text_support/coverage_boundary/action_concreteness/action_reason/missing_reality_boundary/overconfident_claim 等。前端 services.js 解析错误信封：不展示上游原始响应，只把稳定 code 转成可理解的提示并保留当前牌局供重试；成功响应缺 text 标 invalid_response；对话面板把服务端验证过的逐牌解读折叠展示并保留每张牌正逆位和证据标签。首轮明确问题必须覆盖每张牌、返回 synthesis、非空 uncertainty 和至少一条 actions；顶层 text 必须与本轮引用证据共享有意义概念；每张逐牌解读除引用核心锚点外必须复述所引证据中有意义概念；首轮合读除覆盖每张牌外必须为每张牌引用至少一个核心锚点；每条行动必须有非空 reason 且理由与 evidenceIds 指向证据共享有意义概念，并包含时间、次数、范围或结果等可核验标记；服务端校验每条行动 evidenceIds 至少包含核心牌义、问题应用语义或本人确认的记忆；健康/法律/投资等高风险问题缺少具体现实核验边界时拒绝该响应。coverageStatus 为 anchor_only 或 incomplete 时 Prompt 要求模型收窄结论并明确不确定，anchor_only 还必须在 uncertainty 中明确应用证据或资料不足。retrievalMeta 判断为 open 或 mixed 时模型可返回 needsClarification 与一个具体 clarification 问题；澄清分支必须只提这个问题，不能同时返回部分 cardReadings/synthesis/actions/references。结构化追问只要返回 references 必须提供可由证据支持的 claim；若返回 cardReadings 或 synthesis 正文也必须与所引证据共享有意义概念；纯文本追问仍兼容显示。首轮 JSON 不合约时后端最多追加一次只针对结构修复的请求并附带稳定校验码，再走同一套校验；追问可只返回相关牌位，行动清单也可为空。后端只解读已确定的牌不能重新选择牌；已知牌阵在服务端与目录位置逐项校验避免把「关系之镜」牌位套成通用含义。backend/reading_rag.py（迁移前 server/reading-rag.mjs）为每张牌保留正逆位和图像象征，再按问题、牌位和主题补充关系/事业、反思问题、Waite 原典或 Corpora 片段，每条证据有稳定 evidenceId；只有知识库中明确启用的记录才按相关性作为 memoryEvidence 发送并与牌义证据分开；Prompt 要求模型返回引用，服务端拒绝不属于本次牌局的引用；异常时显示重试并保留牌局。backend/reading_eval.py（迁移前 server/reading-eval.mjs）提供不联网的检索、Prompt 和首轮解读回归评分，复用生产环境的 retrieveReadingEvidence 与 parseReadingOutput 因此质量门检查的就是实际发送和校验的协议；requiresProfessionalBoundary 识别健康、法律、投资等高风险问题，这类模型输出若缺 uncertainty 现实边界后端拒绝返回（D7，§AI 接口） |
| §资源与来源 | 详细牌义参考 Waite 原典与 Corpora 开放数据，中文为编辑性综合，来源与方法见 research/tarot/README.md，覆盖测试 tests/card-guides.test.mjs；星幕背景、大门、统一牌背、织物贴图为项目生成资产；78 张 RWS 历史牌图（Pamela Colman Smith / Arthur Edward Waite，1909）源图未修改网页仅做轻微显示滤镜，MIT 声明保留 LICENSE.txt；图标 Phosphor Icons；字体 Noto Serif SC + 系统宋体回退；动画接口依据 Three.js 官方文档（D7，§资源与来源） |
| §视觉与功能验收 | qa/ 保存真实浏览器截图；design-qa.md 记录实际差距与验证范围，不用构建成功替代视觉验收（D7，§视觉与功能验收） |

### D8：`frontend/design-qa.md`（第一版视觉与功能验收）

> 第一版视觉与功能验收记录：可操作前端与最终概念图还原的区分、P1/P2 差距清单、功能走查证据 — 来源：项目仓库 frontend/

| 章节 | 内容摘要 |
| --- | --- |
| §范围 | 用户已授权先制作第一版，未完成的精细动作保留接口；本报告区分可操作前端与最终概念图还原，不能用测试通过声称美术完全一致。视觉源 output/tarot-ui/violet-direction/01-witch-table.png（1586×992）；实机图 qa/reading-final.png（同 CSS 视口）；辅助截图 qa/archive-desktop.png、draw-mobile.png、reading-mobile.png；并排比较 qa/compare.html（源图与实机图等宽），qa/comparison.png 为早期 3D 模型对照；最后复核 qa/comparison-final.png 确认动态立绘更接近参考服饰与人物构图，【差距】牌桌透视、人物比例和背景亮度仍非像素一致；同类状态三张牌已翻开，实际随机牌名不同因此不比较牌面内容像素差，图案锁定真实 RWS 固定牌组（D8，§范围） |
| §比较与修正历史 | 四条 P1/P2 修正记录：1. 首次实时模型法袍过亮、兜帽空洞过大、袖筒不自然（P1）→ 调整材质光照、袖子截面、兜帽前层、织物贴图；2. 阅读面板挡住右侧牌面（P2）→ 面板打开时向左收拢牌组，把读牌/保存移到底部工具区提高卡片可用高度；3. 手机导航缺少图鉴与知识库入口（P2）→ 压缩导航保留全部入口，390×844 下检查控制区均位于屏幕内；4. 模型精细度仍与概念图有明显差距（P1）→ 补充忠实于原图的 2.5D 动态立绘作为默认视觉模式，保留真实 3D 模型切换，呈现方式明确标注，不将立绘当作精细模型（D8，§比较与修正历史） |
| §五项视觉检查 | 字体用 Noto Serif SC/系统宋体，正文与宋体标题层级清晰，不是概念图字体的像素复刻；间距与布局保留女巫上方、牌桌下方、底部输入、顶部导航，全页无滚动，默认动态立绘和 3D 模型的真实体积不同；色彩暗紫、银灰、浅紫交互色与星空远景统一，牌图采用固定历史原画、配色与概念图虚构牌图有意不同；图片拱窗背景、女巫服饰、统一牌背由生成资产提供，3D 模型有真实 Blender/GLB 源，【差距】高级骨骼模型尚未完成；文案演示解读标记明确，没有预测准确率或读心承诺，卡牌数字、身份与正逆位由数据控制（D8，§五项视觉检查） |
| §功能证据 | 浏览器走通开门、提问、牌阵、洗牌、选牌 8/32/71 位置、翻牌、示例解读、追问、保存、书架打开、后记保存；刷新继续后仍为星币七逆位、星币侍从逆位、倒吊人正位，没有重新抽牌；图鉴搜索「星星」仅返回对应固定牌并可进详情；设置中可切换 3D 模型与 2.5D 动态立绘；1440×900 与 390×844 选牌场景 DOM 均为 78 张且每张包围盒完整位于视口内；两视口无文档横向/纵向溢出；最后一轮浏览器 error 日志为空，旧版 THREE.Clock 弃用警告已通过改用 performance.now 移除；6 个领域/资产测试通过，生产构建通过，【技术债】主包包含 Three.js 有体积提示，后续可拆包缓存（D8，§功能证据） |
| §仍未达到最终标准 | 【P1】精细 3D 女巫与骨骼/布料动画未完成；现有模型是程序建模原型，默认视觉模式是标注的 2.5D 动态立绘。【P2】复杂牌阵采用语义牌位和规整排列，未逐个还原传统几何布局。【P2】档案是带透视与悬停动作的书册界面，还不是可漫游的完整 3D 图书馆。【接口阶段】真实 AI、语音、云存储为接口阶段，当前示例解读不能理解自由追问（与 D1 现状冲突，见 §3 冲突 X7）（D8，§仍未达到最终标准） |
| §结论 | 可操作第一版验证：通过。最终概念图与完整产品验收：尚未通过；上述差距保留供后续迭代。final result: blocked（D8，§结论） |

### D9：`.workbuddy/memory/MEMORY.md`（项目长期记忆）

> 项目长期记忆：技术栈迁移史、已知故障与修复、密钥可视化配置、对话界面实现、证据门禁调试结论、架构分层、关键常量与工作区注意事项 — 来源：项目长期记忆

| 章节 | 内容摘要 |
| --- | --- |
| §项目性质 | 星幕塔罗 STARVEIL · Tarot：全屏单页塔罗体验，DeepSeek 解读 + RAG 证据校验；用户自己的项目（非练习 demo）（D9，§项目性质） |
| §技术栈（2026-10-15 已迁移） | 【文档过期提醒】架构已重构（2026-09-23 的记录已过期）：解读 agent 从 Node 中间件迁移为独立 Python 服务 frontend/backend/（FastAPI/uvicorn）；app.py 为服务入口默认端口 8787（STARVEIL_AGENT_PORT）自读 frontend/.env.local（含 DEEPSEEK_API_KEY）；readings.py、reading_rag.py 等对应原 Node 逻辑；backend/.venv 自带虚拟环境；vite.config.mjs 只做反向代理把 /api/readings/*、/api/spreads/recommend 代理到 http://127.0.0.1:8787（changeOrigin 必须 false）；原 frontend/server/*.mjs 保留为参考实现（server-js-reference/）；测试 agent 用 pytest（npm run test:agent），前端仍 node --test tests/*.test.mjs（D9，§技术栈） |
| §一键启动与常见故障 | npm run dev:all（scripts/dev-all.mjs 同时拉起 Python agent + Vite dev server，任一退出整体退出）。【常见故障】只起 Vite（dev 5173 / preview 4173）不起 agent → /api 代理 500 → 前端报「解读服务暂时未连接。牌面已保留」；修复 = 启动 agent（backend/.venv/bin/python -m backend.app）；现在首页也有可视化配置入口（D9，§常见故障） |
| §密钥可视化配置（2026-10-16 新增，46b1cf2 提交） | /api/readings/config（GET/POST/DELETE）+ 首页引导卡 + 偏好设置「AI 解读」区块，写 frontend/.env.local 并热生效；实现在 backend/agent_config.py（readings.py 移植层保持不动）；含 loopback+Origin+Host 白名单三重校验，密钥不回显；环境变量提供的密钥会锁定 UI 编辑；前端 src/AgentConfigCard.jsx（D9，§密钥可视化配置） |
| §对话界面（2026-10-19 WorkBuddy 解剖版 + 全屏三栏） | src/Conversation.jsx + src/conversation.css，WorkBuddy/Codex 式聊天结构（用户气泡/助手头像行/步骤行/统一折叠行/底部 composer）；规格逆向自 WorkBuddy 桌面端 asar（解剖文档 docs/chat-ui-anatomy.md，CSS 抽取件 output/rea/workbuddy-chat-ui.css，asar 解析：header JSON 在偏移 16、size/offset 是字符串）；全屏 .panel.chat.full + .chat-full 网格 264px/1fr/300px（历史对话/聊天/本局牌面），标题栏 ArrowsOut/In 切换，≤1180 收右栏、≤900 收左栏；模型快切 composer 的 ModelMenu → POST /api/readings/config；语音 useVoiceInput（Web Speech API）；纯函数在 src/chat-utils.js，前端测试共 34 个；切换历史会话前自动静默存档当前未保存对话（switchToHistory）（D9，§对话界面） |
| §已知未解决 → 已解决（2026-10-20） | 真实 DeepSeek 调用曾因 claim 级证据门禁被拒（「引用说明与证据不匹配」）；经三轮真实调试，codex/RAG 至 56ca36f 后职业/关系两类真实请求均返回 200 完整解读【已解决痛点】。门禁容错点（都要记住，别再回退）：英文证据（waite/modern）用 _is_mostly_foreign 跳过词面比对；纯套话分句用 _has_real_claim_terms 不计分母；goal section 支持集补同卡 anchor 且门槛 _GOAL_SECTION_SUPPORT_RATIO=0.5；行动具体性改结构化判定（可安排：时间界/任务动词 + 可观察：交付物/完成线索）不再依赖动词白名单；_SYNTHESIS_SUPPORT_RATIO=0.5、_ACTION_TEXT_SUPPORT_RATIO=2/3。教训：不要在门禁上逐个补词表——模型每次输出都换措辞，词表永远追不完，要往结构化/比例判定上走。调参入口：STARVEIL_SUPPORT_RATIO（默认 0.75，1.0 恢复严格）、STARVEIL_DUMP_RAW（指定输出文件路径后转储原始模型输出）（D9，§已知未解决） |
| §语言架构分层（2026-09-23 全仓库实测） | 单语言多形态：一个仓库只跑 JavaScript，分 .mjs（Node ESM，agent 服务端 + 测试）、.jsx（React 组件）、.js（浏览器 ESM 模块）三种；文件计数（排除 node_modules/dist）19 个 .js、16 个 .mjs、11 个 .jsx、6 个 .css、3 个 .py；无 tsconfig、无 pyproject、无 Dockerfile；@types/three 只给编辑器用，项目不走 TS 类型检查；分层：浏览器层 React 19.2 + three.js（src/，29 个 js/jsx）→ Vite 6.4 构建层 → Agent 运行时 → 外部 DeepSeek API → 部署层 worker/index.js（静态资源 + SPA 回退，产物 dist/client）+ CI（Actions Node 22）；9 个 tests/*.test.mjs 用 Node 内置 node --test，无 Jest/Vitest 依赖；Agent 是独立 Python HTTP 服务（uvicorn，127.0.0.1:8787），Vite 只代理（D9，§语言架构分层） |
| §关键常量与契约 | READING_PROMPT_VERSION='nyx-prompt-v47'、READING_PROMPT_CHAR_LIMIT=56_000、MIN_HISTORY_CHAR_BUDGET=4_000；接口 POST /api/readings/interpret、/api/readings/status、/api/readings/debug、/api/spreads/recommend 仅允许 loopback 调用；测试命令：后端 cd frontend && ./backend/.venv/bin/python -m pytest backend/tests -q --basetemp=/tmp/...（337 个，必带 basetemp 否则沙箱 tmp 被拒）；前端 node --test tests/*.test.mjs（34 个）（测试数与 D1 的 312 冲突，见 §3 冲突 X1）；离线评估 npm --prefix frontend run eval:reading。【踩坑】push：代理下 git push 常报 curl 16 HTTP2 framing / Empty reply，绕代理直连被墙；可行解 = git -c http.version=HTTP/1.1 push origin 指定提交SHA:refs/heads/codex/RAG，必要时按 commit 分批。【踩坑】改了 agent 代码必须重启 8787 才生效（cd frontend && npm run agent）；临时验证可另起 STARVEIL_AGENT_PORT=8788 不动用户进程（D9，§关键常量与契约） |
| §工作区注意事项 | 【协作约束】仓库里多个文件长期存在未提交改动（git status 显示 M），改代码前必须先 cp 备份；不要用 git checkout 回滚指定文件，会连带清掉用户自己的未提交工作；用户不接受未预览的大刀阔斧重构，偏好最小化、外科手术式改动，改一处验证一处。【环境坑】沙箱 shell 有 HTTP_PROXY 透明代理，curl 本机端口需加 --noproxy '*'，否则得到假 502（D9，§工作区注意事项） |

### D10：`.workbuddy/memory/2026-10-20.md`（2026-10-20 工作日志）

> 最近工作日志：全屏三栏收起、证据校验 Hybrid 升级、真实 DeepSeek 门禁逐层误拒三轮调试、agent 重启才生效、push 踩坑 — 来源：项目工作日志（2026-10-20）

| 章节 | 内容摘要 |
| --- | --- |
| §全屏三栏：左右栏可收起/展开 | Conversation.jsx：ConversationThread 新增 rails 状态（left/right）存 starveil:chatRails（走 domain 的 load/save），刷新与重进面板保持；收起时列宽 52px，渲染 .chat-rail-expand 竖条按钮（图标 + writing-mode vertical-rl 标题 + 条数），展开态 header 右侧有收起按钮；conversation.css：列宽改用 --rail-l / --rail-r 变量，媒体查询只改变量值避免窄屏覆盖用户选择。【已修 bug】顺手修 .panel.chat .panel-body 缺 flex:1，导致全屏三栏只有内容高度、面板底部大片空白（旧截图同样存在）（D10，§全屏三栏收起） |
| §验证 | npm run build 通过；node --test tests/*.test.mjs 34/34；agent-browser 实测 1440×900 下 264/1fr/300 → 收起左栏 52/1028/300 → 都收起 52/1276/52，reload 后仍保持 left-collapsed，1040px 断点右栏隐藏左栏保持 52px；截图 output/ui-rails-open.png 等三张，注入的会话为占位文本仅用于布局检查；文档 docs/chat-ui-anatomy.md 新增 9.1 节、README 功能行补充折叠说明；已提交 commit e2e7f12 on codex/RAG（含全屏三栏、模型切换、语音、知识库弹窗移除、左右栏收起、docs）16 个文件（D10，§验证） |
| §git 分支关系澄清 | codex/tarot-first-version(d79a758) 是 codex/RAG(现 e2e7f12) 的祖先分支，first-version 没有任何 RAG 没有的提交；git merge codex/tarot-first-version 是 no-op（Already up to date），两分支内容早已重合无需真正合并；origin/codex/RAG 仍停在 46b1cf2，e2e7f12 尚未 push【当时状态】（D10，§git 分支关系澄清） |
| §证据校验升级（Hybrid + 软化门禁） | 真实架构：检索是纯词汇 BM25 + 规则（reading_rag.py），无 embedding；门禁在 parse_reading_output → _claim_supported_by_evidence（逐分句精确 n-gram 命中），_REPAIR_RULES 只把 ValueError 消息映射成稳定码。Phase 1：新增 backend/semantic_reranker.py（无依赖，同义词扩展 + 字符 bigram + 主题/kind 亲和），接到早已存在但生产未用的 ReadingService.semantic_reranker 插槽（app.py 注入）；实测 themed 问题出现 bm25+rules+expansion-v2+semantic-v1，抽象无主题问题按设计 no-op 回落词法。Phase 2：_claim_supported_by_evidence 改为按比例（默认 0.75 实质性分句有据即可），STARVEIL_SUPPORT_RATIO=1.0 可恢复原严格契约；未改 prompt 避免 golden 测试炸。Phase 0：readings.py 加 _REPAIR_CODE_STATS 计数，/api/readings/debug 新增 repairCodes（实测 {}，进程级）。Phase 3：GraphRAG 明确不上（78 张结构化牌，成本远超收益），已写进 backend/README.md。测试 312 → 317 passed。【环境坑】沙箱 pytest 默认 temp 目录会被 broker 拒绝（22 errors），用 --basetemp=/tmp/... 规避。agent 已重启（PID 变动），/api/readings/status 200、configured:true；改动 6 文件未提交（D10，§证据校验升级） |
| §真实 DeepSeek 调试：门禁逐层误拒（第二轮） | 真实请求（职业 comparison / 关系 advice 两个 body）暴露 5 个 fixture 覆盖不到的门禁 bug【fixture 覆盖缺口】，逐个修完后两个主题都返回 200 完整解读：invalid_synthesis（澄清分支模型仍回 synthesis:{}，因 prompt schema 列了该 key → 结构校验加 and not needs_clarification）；card_reading_support（逐条证据比对改合并证据 _reference_evidence_text，与 synthesis/actions 口径一致）；goal_section_evidence（允许引锚点，只要至少一条 retrievalGoals 含本 goal）；action_reason_support（理由改 anchor_only；行动正文判据扩为「所引证据或本次回答正文」action_context_text）；unsupported_reference_claim（新：证据池 15 条里 6 条是英文 waite/modern，中文 claim 对英文原文做 n-gram 匹配必然 0 命中 → 加 _is_mostly_foreign()（CJK 占比低于 0.2），仅对纯外文证据跳过词面比对，id/card/tier 校验照旧）；goal_section_support（新，反复出现：根因两层——分句全是停用/通用/引导词（「事业上需要分析」）时跨词切出的 bigram 被当成实词计入分母 → 加 _has_real_claim_terms()（掩码 filler 词后需有 ≥2 字连续片段）+ _CLAIM_FRAMING_WORDS（应用/层面/强调/提示…）；advice/comparison 段落天然一半是执行建议不在牌义库 → 支持集补入同卡 anchor，门槛用独立常量 _GOAL_SECTION_SUPPORT_RATIO = 0.5，实测分布 0.44–0.74）；action_concreteness（新：_ACTION_VERB_PATTERN 只有两字动词，「列两栏/写三条」不命中 → 加 _ACTION_COUNTED_VERB_PATTERN 单字动词 + 数量词）；另修：修复回路二次失败返回次错而非首错；新增 STARVEIL_DUMP_RAW（指定输出路径）转储原始模型输出，默认关闭（D10，§真实调试第二轮） |
| §真实调试·验证与提交 | 后端 328 passed（321 → 325 → 327 → 328），前端 34 passed；真实调用：职业 comparison 200（text 826 字，1 goalSection / 3 cardReadings / synthesis / 3 actions / 12 refs），关系 advice 200（text 397 字，结构同样完整）；已推送 codex/RAG：a0a5f4d（第一轮 5 项）、494bdd0（第二轮 4 项）、1fc504f（锚点支持测试）。【踩坑】push：本机 HTTP_PROXY 走 git push 会 curl 16 HTTP2 framing / Empty reply，绕开代理直连被墙（SIGTERM）；可行解 = 保留代理 + git -c http.version=HTTP/1.1 push origin 指定提交SHA:refs/heads/codex/RAG，必要时按 commit 分批推。【踩坑】8787 上的常驻 agent（PID 23266）仍是旧代码，页面上要生效必须重启（cd frontend && npm run agent）；本次验证用 8788 临时实例（STARVEIL_AGENT_PORT=8788），验完已关闭（D10，§验证与提交） |
| §第三轮：重启后继续真机验证（17:00 之后） | 用户在自己终端跑 npm run agent 报 [Errno 48] 8787 in use（旧 PID 23266 占着端口）；处理：kill 旧实例 → 重启 → 8787 恢复（同一次还确认 dist/client 构建比所有 src 新，4173 预览服务的就是最新前端，无需重 build）。新一轮真机误拒（各模型输出不同，逐次暴露）：action_concreteness（行动用了白名单外的动词争取/接触/约定；根因是用动词词表判定具体性，词表永远追不完 → 改为结构化判定：可安排（时间界或任务动词）+ 可观察（交付物或完成线索）；同时把时间词从「可观察」里拆出去（新增 _ACTION_COMPLETION_PATTERN，原 _ACTION_MARKER_PATTERN 删除），否则「明天好好沟通」会被放行）；action_text_support（行动里的程序性分句「只问试用期或转岗条件」「把回答记录下来」不在证据也不在正文里，比例 0.67 低于 0.75 → 独立常量 _ACTION_TEXT_SUPPORT_RATIO = 2/3）；synthesis_support（综合解读本质是连接性解释「三者串联起来」「当作辨认旧模式的入口」，实测 0.56–0.6 被 0.75 拒 → _SYNTHESIS_SUPPORT_RATIO = 0.5）。【试错记录】先把行动门槛降到 0.5，导致「行动里夹带对方已经搬去火星」的既有契约测试通过（1/2=0.5）→ 退回思路，改用 2/3，既有用例 0.5 低于 0.667 仍被拒（D10，§第三轮） |
| §第三轮·结论与提交 | 后端 337 passed（328 → 337，新增 9 条参数化用例锁具体性与两个比例门槛），前端 34 passed；真实调用（8788 临时实例 + STARVEIL_DUMP_RAW）：职业 comparison 200（text 431 / comparison 215 / 3 牌 / synth 177 / 3 行动 / 9 引用），关系 advice 200（text 658 / advice 194 / 3 牌 / synth 134 / 3 行动 / 9 引用）；提交 56ca36f 已推送，远端 codex/RAG = 本地（flush 后 git ls-remote 确认）；8787 已换新代码（新 PID 83257，npm run agent 后台启动，configured:true）。经验：每次真实调用都会换一种措辞，因此门禁修复要往「结构化判定」走，而不是逐个补词表；单次真机 200 不能当作已修完，至少跑两个不同主题（D10，§第三轮结论） |

### D11：`.workbuddy/memory/2026-10-19.md`（2026-10-19 工作日志）

> 对话面板改造日志：REA 逆向 WorkBuddy 聊天界面、conversation.css 重写、移除知识库悬浮横幅、全屏三栏 + 模型快切 + 语音输入 — 来源：项目工作日志（2026-10-19）

| 章节 | 内容摘要 |
| --- | --- |
| §REA 逆向 WorkBuddy 聊天界面 → 星幕对话面板改造 | 提交 46b1cf2（feat(ui): agent-style conversation panel + key config）已推到 origin/codex/RAG。REA 提取要点：asar 解析 header JSON 在偏移 16（uint32@0=header 长度；raw_decode(raw[16:]) 得 header+长度，文件内容基址 = 16 + header_json_bytes，size/offset 是字符串需转 int）；关键文件 /renderer/assets/lib-chat-ui-B1cKgDdf.js（9.96MB，REA 因单文件过大跳过，类名是运行时拼接、CSS 才是结构真相）+ lib-chat-ui-P79XYQqL.css（1.43MB，50K 行、8403 规则、中文分节注释、含设计令牌），已抽到 output/rea/；结构体系 .cr-*（cr-message-list / cr-frame / cr-agent / cr-self-bubble / cr-collapse / cr-input-container / cr-block-markdown），令牌 --cr-internal-*、--cr-md-*，暗色 .cb-dark；关键规格：用户气泡 16 16 0 16 不对称圆角、fit-content、13/19 字阶；输入框 24px 圆角 + 0.5px 发丝边框 + 64px 最小编辑高 + 12px 内边距工具行；助手 24px 圆头像；底部渐隐 mask；container queries；流式流光；解剖文档 docs/chat-ui-anatomy.md（D11，§REA 逆向） |
| §conversation.css 重写按解剖结果落地 | --sv-chat-* 令牌层（对齐 --cr 规格）、.turn-user 气泡（14px 圆角 + 右下 4px）、.step-row 等宽步骤行、.trace-row 三级文字色折叠行、.chat-input-container 24px 圆角 + 发丝边框、.chat-banner 错误横幅移到输入框上方共享边线、左导轨谱系、系统事件行；验证 build + node 29 全过；4173/8787 重启；浏览器实测三张截图存 output/ui-chat-v2-{top,body,expanded}.png。【当时未解决】截图里助手正文是注入的模拟消息（结构与真实返回一致）——真实调用仍被后端证据门禁拒（claim 级不匹配，未解决，见 10-16 日志；后于 2026-10-20 三轮调试后解决，见 D10）；改动未提交（D11，§css 重写） |
| §移除「本局使用我的知识库」悬浮横幅（用户要求，11:00） | 用户要求弹窗去掉、底部输入框里选就行；已删 App.jsx 的 .memory-session-toggle 渲染行 + styles.css 两行样式（含 media query），无其他引用；验证 build + node 29 过；浏览器实测 reading 视图无横幅、对话面板 composer 工具行「本局知识库 · 关/开」双向切换正常；截图 output/ui-chat-no-banner.png、ui-table-no-banner.png。【UX 取舍/遗留】横幅删掉后，发起解读前（还没打开对话面板时）没有开关入口，usePersonalMemory 默认关；用户认可这个取舍（D11，§移除横幅） |
| §全屏三栏对话 + 模型快切 + 语音输入（用户需求，14:40） | 全屏：AppPanel 新增 full 属性（.panel.chat.full 左右 2% 整宽），标题栏新增「全屏对话/退出全屏」按钮，chatFull 状态在离开 reading 面板时复位；三栏：ConversationThread 新增 full/history/onSelectHistory/onModelChanged，全屏时渲染 .chat-full 网格 264px/1fr/300px（左 .chat-history 当前会话置顶 + 存档倒序点击直切；中 .chat-main；右 .chat-cards 牌图 44px + 牌名/牌位/正逆位/关键词），断点 ≤1180 收右栏、≤900 收左栏；防丢数据：新增 switchToHistory() 切换前若当前对话有消息且未存档静默写入 history 再切；模型快切：composer 工具行 ModelMenu，选项 deepseek-flash / deepseek-chat，POST /api/readings/config 写 .env.local 热生效，env 锁定时禁用，已实测切换 chat→flash 往返；语音输入：useVoiceInput（Web Speech API，zh-CN，interimResults），结果经 mergeTranscript 追加，Chrome/Edge 支持时显示麦克风按钮、无权限时 toast 提示，headless 验证降级路径正常；新文件 src/chat-utils.js（formatRelativeTime / mergeTranscript）+ tests/chat-utils.test.mjs（5 个用例），前端测试 29 → 34；文档 docs/chat-ui-anatomy.md 追加「9. 全屏三栏」、README 功能与测试数量同步；截图 output/ui-chat-full-3col.png、output/ui-chat-model-menu.png（用注入的演示会话/存档，验证后已清 localStorage）（D11，§全屏三栏） |

---

## 3. 冲突记录

> 不同资料对同一事实描述矛盾时，**并列保留两个版本**，不做裁决。

| 编号 | 冲突主题 | 版本 A | 出处 A | 版本 B | 出处 B | 差异说明 |
| --- | --- | --- | --- | --- | --- | --- |
| X1 | 后端 Python agent pytest 用例总数 | 312 个 | D1，§测试 | 317 个 → 328 个 → 337 个 | D10，§证据校验升级；D10，§真实调试第二轮；D10，§第三轮结论；D9，§关键常量与契约 | 同一项目不同时点快照：D1/D2 停留在 312，D10 逐轮记录 312→317→328→337，D9 长期记忆记录最新值 337（且要求 pytest 必带 --basetemp）。数量差异源于时间推进，D1 未同步最新数字 |
| X2 | 前端 Node 测试用例数 | 294 项通过（§16）/ 299 个全量测试（§19） | D2，§16 与 D2，§19 | 277 个（JS 参考实现）/ 29 个 / 34 个 | D7，§测试；D11，§REA 逆向与 §移除横幅；D1，§测试、D9、D10 | 迁移期参考实现 277 与不同日期快照 29/34 混用；D2 内部两节亦不一致（294 vs 299）；D1 文件内同时出现「29 个 Node 用例」（详表）与「34 个用例」（测试节）。需下游按最新时点取 34 |
| X3 | 女巫默认视觉方向 | 真实 3D 网格与模型（蒙面守夜人 Nyx v2），不再以人物图片承担角色 | D5，开头用户确认方向与 §造型决策 | v3 动态立绘为默认（银紫发、法袍飘动、衣料粒子），程序 3D 模型归档不作默认，不宣称骨骼面部动画或布料物理 | D6，§Latest user direction（明确 supersedes Nyx v2）；D7，§当前可操作能力；D8，§仍未达到最终标准 P1；D1，§设计边界 | D6 明文「Latest user direction supersedes Nyx v2」：用户最新指示取代 D5 的 3D 方向；两版并存是时间线先后（v2 3D → 2026-09-12 统一插画海报 → v3 立绘）。并列保留不做裁决，但标注了取代关系与各自时点 |
| X4 | RAG 检索是否已含语义重排 | 语义 reranker 是可选接口，超时或不可用时回退到离线规则 | D2，§15 | 检索是纯词汇 BM25 + 规则无 embedding；新增 semantic_reranker.py 接到「早已存在但生产未用」的插槽，themed 问题实测出现 bm25+rules+expansion-v2+semantic-v1，抽象无主题问题 no-op 回落词法 | D10，§证据校验升级 | D2 描述 Node 参考实现视角（2026-09-22 时点，文件注明不提交 GitHub）；D10 为 2026-10-20 Python 侧实测。同一项目不同实现/不同时点的表述差异 |
| X5 | 检索诊断版本号 | bm25+rules+expansion-v2 | D2，§19；D3，§19 | bm25+rules+expansion-v2+semantic-v1（themed 问题实测） | D10，§证据校验升级 | D10 在 v2 后缀后追加 semantic-v1；资料未说明该后缀是取代原命名还是附加诊断信息 |
| X6 | 桌面选牌布局 | 6 行 × 13 列全部同时可见不重叠，窄屏 13 行 × 6 列 | D6，§Confirmed user direction 第 4 条；D7，§当前可操作能力 | 78 张固定牌的重叠弧形水平扇带/牌带，拖动/滚轮浏览、悬停抬牌、点击抽到中央桌面；无全 78 网格、无文档滚动 | D6，§Latest card selection（明文 supersedes ALL previous grid requirements）；D1，§功能 | D6 内部两代指示并存且后者声明取代前者；D7 未同步更新为弧形牌带表述。哪一版为当前生效态需主理人确认 |
| X7 | AI 解读成熟度 | 真实 AI、语音、云存储为接口阶段；当前示例解读不能理解自由追问 | D8，§仍未达到最终标准 | DeepSeek 多轮对话式解读（沿用牌局不重抽）、模型快切热生效、语音输入均已列入功能清单 | D1，§功能；D7，§当前可操作能力与 §AI 接口；D11，§全屏三栏 | D8 是第一版验收快照（final result: blocked），D1/D7/D11 为后续迭代后状态；D10 另记录真实调用曾长期被门禁拒、2026-10-20 才两主题 200。并列保留 |
| X8 | 个人知识库「本局开关」入口形态 | UI 只有在用户打开「本局使用我的知识库」后才发送 usePersonalMemory:true | D2，§18.1；D3，§18.1 | 悬浮横幅已移除，发起解读前（未打开对话面板时）没有开关入口，usePersonalMemory 默认关，用户认可该取舍；工具行内「本局知识库·关/开」可切换 | D11，§移除横幅；D10，§验证（提交内容含知识库弹窗移除） | 入口形态随时间变化（横幅 → composer 工具行 → 解读前无入口）；「默认关、需显式开启、服务端再校验」的核心事实一致，入口可用性描述不同 |

---

## 4. 硬指标清单

| 章节 | 硬指标 | 状态 |
| --- | --- | --- |
| §0 | 元信息完整：标题/版本/状态/创建日期/整理人/审核人/原始资料清单均填写真实值，无占位符 | ✅ |
| §1 | 每份资料有解析状态，失败/跳过注明原因（本批 11 份全部已解析，无失败/跳过项，已注明类型均为 md 及原因） | ✅ |
| §2 | 每份文档按章节逐条摘要，每条标注了 `D编号，§章节`（D1–D11 共 11 份，均按自身章节结构逐条摘要并标注出处） | ✅ |
| §3 | 冲突信息并列保留，不做裁决（X1–X8 共 8 条，均并列多版本并标注出处） | ✅ |
| 全文 | 无占位符、示例前缀或待补充残留（已按校验脚本标记清单逐项自查通过：无占位符、无日期占位、无待定标记、无示例前缀） | ✅ |
| 附录 | 附录 A（生成流程）与附录 B（解析 Skill）均保留 | ✅ |

---

## 附录 A：生成流程

### 流程总览

| 步骤 | 动作 | 落入章节 |
| --- | --- | --- |
| Step0 | 读取模板 + 全部原始资料（11 份 md，Read 工具直读） | — |
| Step1 | 盘点资料清单，标注解析状态（全部已解析） | §1 |
| Step2 | 逐份打开资料，按自身章节结构逐条摘要，重点提取痛点/限制/待决策/技术债 | §2 |
| Step3 | 交叉比对不同资料，发现并记录矛盾（8 条并列保留） | §3 |
| Step4 | 逐项核验硬指标 | §4 |

```mermaid
flowchart LR
    S0[读取模板与资料] --> S1[盘点资料清单]
    S1 --> S2[逐份精读逐章节摘要]
    S2 --> S3[交叉比对记录冲突]
    S3 --> S4[硬指标自检]
```

### 整理原则

1. **逐份精读，不跨文档归并**：摘要按文档自身章节结构组织，不做跨文档的主题重组（那是下游的事）
2. **出处即章节号**：每条摘要标注 `D编号，§章节`，直接映射回原文位置
3. **冲突保留**：矛盾信息并列保留多个版本并标注出处，不擅自裁决
4. **事实驱动**：以原始资料中的事实为准，不添加主观推断；推断类内容（如「与 D5 方向冲突」的取代关系判断）均以原文明文表述为依据并注明出处
5. **痛点导向**：按本阶段整理目标，在摘要行内以【痛点】【限制】【待决策】【技术债】【踩坑】【P1】【P2】【已修】等标记突出问题类事实，供下游痛点分析直接消费

---

## 附录 B：解析 Skill

- `md`：Markdown 类项目文档、README、记忆与日志（本批 11 份资料全部为此类型，由 Read 工具直接解析，无需转换）
- `docx`：Word 类产品/业务文档（本批未出现）
- `pdf`：PDF 类规范、手册、报告（本批未出现）
- `pptx`：PPT 类方案/汇报（本批未出现）
- `xlsx`：Excel 类数据清单、指标表（本批未出现）

> 说明：本批资料全部位于项目仓库内的 Markdown 文件，解析状态均为「已解析」；若后续轮次转来 docx/pdf/pptx/xlsx 资料，将按对应解析 Skill 处理并在 §1 更新解析状态。
