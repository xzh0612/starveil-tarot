# 星幕塔罗 STARVEIL · Tarot

一个全屏单页的私人塔罗体验：在月光书房里提出问题，由 DeepSeek 根据固定的韦特牌义进行解读，并把每次牌局保存成可回看的记录。

## 功能

- 问题驱动的牌阵推荐：先输入问题，获得 2–3 个适合的牌阵与推荐理由，再由用户确认。
- 单牌、三牌、时间之流、两条道路、关系之镜、事业之径、马蹄、凯尔特十字、十二月轮和自定义牌阵。
- 78 张固定牌面。选牌时以桌面弧形牌带呈现，可拖动、滚轮、键盘或滑杆浏览；悬停抬牌，点击抽取，随后翻牌。
- 78 张牌的中文正位、逆位、关系、事业和反思解读，以及牌义图鉴。
- DeepSeek 多轮对话式解读：沿用本次牌局，不重新抽牌。
- 对话面板可切换全屏三栏：左侧历史对话（点击直切、切走前自动存档当前对话）、中间聊天、右侧本局牌面。左右两栏都能单独收起成 52px 竖边条，再点一下展开，选择会记在本机。
- 模型快速切换：在输入框工具行直接切 `deepseek-flash` / `deepseek-chat`，写入 `.env.local` 后对运行中的服务热生效。
- 语音输入：Chrome / Edge 下用浏览器语音识别把话转成文字，追加到输入框；不支持或无权限时给出提示。
- 解读反馈标记：可在本机标记“有帮助”或“需要复核”，随档案导出但不会发送给模型。
- 动态插画书房：紫色绒面牌桌、烛光、星尘、衣料流光和抬眼／低头视线状态。
- 本地档案、后记、个人知识库、JSON 导入／导出和原创循环 BGM。
- AI 生成内容标注：每条解读旁有「AI 生成」标识，输入框下常驻免责说明，导出的档案／备份文件带机器可读的 `contentNotice` 元数据。

## 架构

浏览器里的 React 单页 → Vite（把 `/api/*` 反向代理到本机 agent）→ Python 解读服务（FastAPI + uvicorn，监听 `127.0.0.1:8787`）→ DeepSeek API。

解读 agent 最初是挂在 Vite 上的 Node ESM 中间件，现已迁移为独立的 Python 服务（`frontend/backend/`）；迁移前的实现原样保留在 `frontend/server-js-reference/`，继续作为离线评估和逐条行为对照的参考。浏览器始终只与一个源通信。

## 本地运行

需要 Node 22+ 与 Python 3.13。

```bash
cd frontend
npm install

python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# 先在 frontend/.env.local 里填好 DEEPSEEK_API_KEY，见下一节
npm run dev:all
```

`dev:all` 会同时拉起解读 agent 和 Vite dev server，并互相守护：任一退出就整体退出。打开 <http://localhost:5173>。

只想看界面、不需要 AI 解读时，可以单独跑 `npm run dev`；此时 `/api/readings/interpret` 拿不到服务（代理返回 500），前端会显示「解读服务暂时未连接。牌面已保留」。遇到这条提示，基本就是 agent 没在跑——服务起来之后，也可以直接在对话面板的引导卡里配置密钥，不用改任何文件。

改 agent 代码时用 `npm run agent:dev` 代替 `npm run agent`：它用 uvicorn `--reload` 只监听 `backend/`，保存即生效，不用手动重启 8787。生产式启动仍是 `npm run agent`。

生产构建：

```bash
npm run build
```

本地预览构建产物用 `npm run preview`（同样需要 agent 在跑才会解读）。

GitHub Actions 会在每次分支推送、Pull Request 和手动触发时跑两个作业：`quality` 在 `frontend/` 下用 Node 22 执行锁定依赖安装、Sites 生产构建、前端 Node 测试、离线 RAG/Prompt 评估和高危依赖审计；`agent-tests` 用 Python 3.13 建虚拟环境、跑 `backend/tests` 全部 pytest 用例，再跑一次 Python 侧的离线评估与 30 例人工标注检索基准。工作流见 `.github/workflows/quality.yml`，不需要也不会读取 DeepSeek 密钥。

RAG 与 Prompt 离线质量门：

```bash
npm --prefix frontend run eval:reading      # 对照 Node 参考实现
npm --prefix frontend run eval:reading:py   # 直接跑 Python agent
npm --prefix frontend run eval:benchmark    # 30 例人工标注检索基准（Recall@8 / 跑题率）
```

`eval:benchmark` 读取 `frontend/backend/data/reading_benchmark.json`，逐例核对人工判定为必需的 `(牌, 证据种类)` 是否进入召回窗口，并统计落在问题领域之外的应用层证据比例。标注是种子集，新增案例应先人工判断相关性再写入，不要按当前检索结果反推。

<details>
<summary>离线评估覆盖的质量门（Prompt v47 / RAG v55）</summary>

它不调用 DeepSeek，只用固定问题、牌面和模拟 JSON 检查证据主题覆盖、逐牌覆盖、核心锚点、正文、行动正文和行动理由的证据支持、引用合法性、可执行建议、首轮与追问轮次的覆盖不足边界、选择型问题的决策应用召回、明确“哪条/哪种”及“要不要/该不该”比较目标路由、常见“能不能/有没有机会”预测目标路由、否定意图短语不会误触发目标路由、目标路由评估覆盖 advice/forecast/explanation/comparison 且检查额外误路由、混合主题不会混入无关应用域、单目标不会混入未路由的 goalSections、目标化 responsePlan、按目标生成的 directAnswer 开场框架和 actionGuidance 行动约束、首轮先直接回应当前问题再按目标展开、混合问题的 goalPlan 逐目标顺序、goalSections 分段顺序与证据绑定、所有已路由目标的层级引用（建议必须有 application 证据，且每条首轮行动建议在 application 可用时也必须引用对应目标证据）、目标证据覆盖诊断与按 advice/forecast/explanation/comparison 写明缺失层级的覆盖不足边界、大牌阵动态证据预算、按牌位目标层级预留、紧预算下先保留牌位语义证据再预留目标证据、混合目标按牌位轮转预留、未来-only 问题保留牌位应用语义、显式预算先保留目标层、按分数预留目标证据、弱代词与上下文追问的原始主题继承、当前目标覆盖旧目标、追问目标路由传入证据检索、离线评估复用目标证据层级、具体引用词校验、引用 claim 逐句证据校验、绝对断言校准（覆盖全部用户可见字段）、确定时间预测校准（拒绝把日期写成必然结果，允许把时间范围用于观察或核验动作）、澄清分支边界（不伪造 fallback 引用）、明确 mixed 目标不被无谓澄清和 Prompt 上下文边界、模型证据与检索诊断隔离、牌阵推荐理由必须引用目录牌位概念并与用户问题主题相连、结构化追问正文证据支持、纯文本追问也必须命中具体证据、结构化追问必须引用当前目标层级、目标分段也能作为追问正文的证据来源、牌阵位置语义命中与诊断字段、首轮逐牌解读对可用牌位证据的引用约束、行动正文与理由证据支持（正文和理由必须命中非通用牌面概念）、顶层正文证据支持、首轮正文引用范围约束、单目标目标分段证据支持、首轮目标分段层级约束、目标分段层级修复指引、目标化覆盖边界修复指引、结构化 grounding 修复指引、共享目标证据层级契约、逐句、逐分句结构化正文证据约束、混合主题的逐域覆盖诊断、按牌位的目标证据缺口诊断，以及混合目标顶层摘要覆盖和紧预算下按牌位预留证据槽位。当前 Python agent 侧共有 341 个 pytest 用例（前端另有 42 个 Node 用例），离线 Prompt、RAG 检索和结构化解读评估均需通过；离线契约与线上解析同样校验首轮 action 的目标 application 证据、结构化追问 action 的证据支持、跨用户历史轮次保留高风险现实边界，以及逗号、顿号和常见转折/并列/因果连接词分句不能追加无来源事实。

本轮还增加了 activeQuestion 相关性门禁：当问题明确落在关系、事业或自我主题时，顶层回答必须覆盖每个明确主题，并为每个主题复述至少一个同域词；证据充分但答非所问的泛化文本会被标记为 `question_relevance` 并进入一次有边界的修复流程。

本轮还增加了 response goal 门禁：`advice`、`forecast`、`explanation`、`comparison` 和混合目标分段必须使用对应的回答模式；例如预测必须同时出现趋势线索和现实核验边界，解释需要说明原因或牌面线索。模式不匹配会返回 `goal_alignment` 并进入一次有边界的修复流程。

目标层级证据也必须落到顶层正文：只要某个目标存在可用的 `requiredEvidenceTier`，正文就要复述该层级证据中的具体概念；预测不能只挂上 reference 引用后继续用泛化建议作答。

比较目标还必须在正文中点出至少一侧或一个选项，并同时写出条件、代价或取舍，避免“比较一下”这类空泛回答通过目标校验。

涉及“他真实想法”“她是否在乎”等他人内心的问题，会额外要求 `uncertainty` 明确写出牌面不可验证内心，并把核验方式落到沟通、现实互动或可观察行为；这条边界也会进入 Prompt 调试上下文和自动修复。

本轮还增加了追问质量门禁：如果模型返回 `followUp`，它必须是一个与当前问题或目标相关的具体单问句；泛泛的“还有什么想问的吗”和连续多个问题会返回 `followup_question`，并进入一次有边界的修复流程。

RAG v55 在 v49 的通用解释证据隔离、个人记忆短词保护、口语比较、因果路由和 perspective boundary 之外，补齐了胸口疼、头疼、停药、换药、起诉、买房、睡眠不足等口语高风险表达的现实边界；普通“焦虑/辞职”仍不会被自动扩大为专业风险；同时把“他到底在想什么”“对方是什么心态”“她什么意思”等第三人称内心状态口语统一纳入 perspective boundary，要求把核验落到沟通和可观察行为；v52 将个人记忆召回方法名抽成共享契约常量，让 Prompt 与实际检索器不会再次漂移；并补上“他对我态度如何”“对方怎么看我”等关系视角口语边界；这些表达现在同时路由到 explanation，能拿到对应的核心证据层；问题级专业边界与 action 级门禁现在共同覆盖买房、购房、合同、上诉、仲裁和离婚等决定。

Prompt v47 在 v44 的开放目标门禁之外，继续覆盖“有戏、有没有机会、有没有结果、对方有没有感觉”等口语化结果预测：首轮 `responsePlan.goal=open` 且不允许澄清时，只能给核心牌面线索、现实观察和用户可控制的记录动作，不能通过换词擅自输出结果预测或他人内心判断；解析器与离线评估都会返回稳定的 `open_goal_prediction` 代码并触发一次有边界的修复。高风险 action 仍必须先安排核实现实资料、评估风险或咨询合格专业人士；买房、购房、合同、上诉、仲裁和离婚等动作也不能直接要求执行不可逆决定。Prompt 总字符预算约为 56,000；当大牌阵与长历史接近上限时，服务端优先保留当前证据和最近一轮，只进一步压缩更早历史，并在 `promptBudget.historyLimits` 中记录实际预算。 单条过长历史会采用开头加结尾的压缩方式，并用省略标记隔开中段，避免丢掉末尾的行动和边界信息。

</details>

## DeepSeek 配置

两种方式，任选其一：

- **在应用里配置（推荐）**：首次解读时对话面板会出现「接入你的密钥」引导卡；之后随时可以在右上角「偏好设置 → AI 解读」里修改、更换或清除。密钥保存到 `frontend/.env.local` 并即时生效，不需要重启；页面只显示「已配置/未配置」，密钥本身不会回显。
- **手工配置**：直接编辑 `frontend/.env.local`：

```dotenv
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-flash
# 可选：前端默认就走这个路径
VITE_READING_ENDPOINT=/api/readings/interpret
```

密钥只能放在 `DEEPSEEK_API_KEY` 里由 Python agent 读取，不要加 `VITE_` 前缀——带该前缀的变量会被内联进浏览器产物。`STARVEIL_AGENT_PORT` 可以改 agent 端口（默认 8787），Vite 的代理目标会跟着它走。没有密钥时 agent 仍会启动，但解读接口返回 `provider_not_configured`。若密钥来自启动时的环境变量，界面会显示「由环境变量提供」并锁定编辑。

agent 提供五个只允许本机调用的接口：

- `POST /api/readings/interpret`：发送已确定的牌局和对话，返回解读。
- `POST /api/spreads/recommend`：根据问题推荐牌阵。
- `GET /api/readings/status`：返回 provider 与模型是否已就绪。
- `GET/POST/DELETE /api/readings/config`：读取、保存或清除本机密钥与模型；仅接受 loopback 来源，并校验 Host 白名单以防 DNS rebinding，密钥永不回显。
- `POST /api/readings/debug`：返回 Prompt 与检索的调试上下文。

接口会校验牌面、正逆位、请求大小、来源、并发和超时。首轮模型输出必须逐牌引用固定牌义、让正文和合读与证据相符、用核心锚点完成合读、为行动建议提供证据、在 advice/comparison 目标有 application 证据时让每条行动都引用对应 application、与证据相符的理由和可观察完成标准，并拒绝“保证一定会”之类的绝对预测；健康、法律、投资等高风险问题还必须包含现实依据边界。只有主题和回答目标都开放的问题才会先进入只提一个具体问题的澄清分支；已经明确多个目标的 mixed 问题直接按目标分段回答，不能同时返回部分牌义。若 JSON 结构偶发不合约，后端最多自动修复一次并重新校验。档案与个人知识库不会自动发送给模型。

## 测试

```bash
npm --prefix frontend run test:agent          # Python agent，341 个用例
cd frontend && node --test tests/*.test.mjs   # 前端，42 个用例
```

在受限沙箱或 CI 里跑 pytest 时加 `--basetemp=/tmp/starveil-pytest`：默认临时目录可能被沙箱拒绝，表现为大量 `PermissionError`，而不是测试真的失败。

Python 侧覆盖 Prompt 组装与黄金快照、RAG 检索与输出校验、解读服务（含用假 transport 注入 provider 失败、超时和鉴权错误）、牌阵推荐与离线评估；Node 侧覆盖牌义完整性、固定牌序、随机洗牌、前端服务层、对话工具函数、网站静态资源和 Sites 构建检查。

## 目录

```text
frontend/src/                   React 页面、牌局状态、动态海报和弧形牌带
frontend/backend/               Python 解读 agent（FastAPI + uvicorn，端口 8787）
frontend/server-js-reference/   迁移前的 Node 实现与离线评估，作为行为对照（冻结：只读参考，不再加新功能）
frontend/public/                78 张牌、背景、BGM 和可选 GLB 资源
frontend/tests/                 前端 Node 测试
frontend/qa/                    浏览器验收记录与截图
docs/                           设计与建模文档
```

## 设计边界

当前女巫使用统一场景插画的动态海报方案，不宣称骨骼 3D、连续口型或真实手指抓牌。旧版 Blender/GLB 模型保留在 `frontend/public/models/`，并通过 `LegacyScene.jsx` 作为后续替换接口。

塔罗解读用于自我反思，不读取他人内心，也不保证未来事件。涉及健康、法律或投资决定时，应以现实信息和专业意见为依据。

界面上由 AI 模型生成的内容都有显式标注：助手回合旁有「AI 生成」标签，输入框下方常驻「AI 生成内容 · 仅供自我反思」说明，本地示例模式则标为「本地示例」而不是 AI 内容。导出档案和备份时，文件外层会写入 `contentNotice`（`aiGenerated`、`generator`、`disclaimer`、`policy`、`labeledAt`），供下游工具识别来源。

## 来源与许可

牌图来源、原典资料、中文编辑方法和生成素材说明见 `frontend/research/tarot/README.md` 与 `frontend/public/assets/generated-assets.md`。牌图许可文件保留在 `frontend/public/assets/cards/LICENSE.txt`。
