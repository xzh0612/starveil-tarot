# 星幕塔罗 STARVEIL · Tarot

一个全屏单页的私人塔罗体验：在月光书房里提出问题，由 DeepSeek 根据固定的韦特牌义进行解读，并把每次牌局保存成可回看的记录。

## 功能

- 问题驱动的牌阵推荐：先输入问题，获得 2–3 个适合的牌阵与推荐理由，再由用户确认。
- 单牌、三牌、时间之流、两条道路、关系之镜、事业之径、马蹄、凯尔特十字、十二月轮和自定义牌阵。
- 78 张固定牌面。选牌时以桌面弧形牌带呈现，可拖动、滚轮、键盘或滑杆浏览；悬停抬牌，点击抽取，随后翻牌。
- 78 张牌的中文正位、逆位、关系、事业和反思解读，以及牌义图鉴。
- DeepSeek 多轮对话式解读：沿用本次牌局，不重新抽牌。
- 动态插画书房：紫色绒面牌桌、烛光、星尘、衣料流光和抬眼／低头视线状态。
- 本地档案、后记、个人知识库、JSON 导出和原创循环 BGM。

## 本地运行

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

打开 <http://localhost:4173>。

生产构建：

```bash
npm run build
```

GitHub Actions 会在每次分支推送、Pull Request 和手动触发时执行锁定依赖安装、全量测试、离线 RAG/Prompt 评估、高危依赖审计和 Sites 生产构建。工作流见 `.github/workflows/quality.yml`，不需要也不会读取 DeepSeek 密钥。

RAG 与 Prompt 离线质量门：

```bash
npm --prefix frontend run eval:reading
```

它不调用 DeepSeek，只用固定问题、牌面和模拟 JSON 检查证据主题覆盖、逐牌覆盖、核心锚点、正文、行动正文和行动理由的证据支持、引用合法性、可执行建议、首轮与追问轮次的覆盖不足边界、选择型问题的决策应用召回、明确“哪条/哪种”及“要不要/该不该”比较目标路由、常见“能不能/有没有机会”预测目标路由、否定意图短语不会误触发目标路由、目标路由评估覆盖 advice/forecast/explanation/comparison、混合主题不会混入无关应用域、单目标不会混入未路由的 goalSections、目标化 responsePlan、首轮先直接回应当前问题再按目标展开、混合问题的 goalPlan 逐目标顺序、goalSections 分段顺序与证据绑定、所有已路由目标的层级引用（建议必须有 application 证据，且每条首轮行动建议在 application 可用时也必须引用对应目标证据）、目标证据覆盖诊断与覆盖不足边界、大牌阵动态证据预算与目标层级预留、按分数预留目标证据、弱代词追问的原始主题继承、离线评估复用目标证据层级、具体引用词校验、引用 claim 逐句证据校验、绝对断言校准（覆盖全部用户可见字段）、澄清分支边界（不伪造 fallback 引用）、明确 mixed 目标不被无谓澄清和 Prompt 上下文边界、模型证据与检索诊断隔离、牌阵推荐理由必须引用目录牌位概念并与用户问题主题相连、结构化追问正文证据支持、纯文本追问也必须命中具体证据、结构化追问必须引用当前目标层级、目标分段也能作为追问正文的证据来源、牌阵位置语义命中与诊断字段、首轮逐牌解读对可用牌位证据的引用约束、行动正文与理由证据支持（正文和理由必须命中非通用牌面概念）、顶层正文证据支持、首轮正文引用范围约束、单目标目标分段证据支持、首轮目标分段层级约束、目标分段层级修复指引、结构化 grounding 修复指引、共享目标证据层级契约、逐句、逐分句结构化正文证据约束、混合主题的逐域覆盖诊断，以及混合目标顶层摘要覆盖和紧预算下按牌位预留证据槽位。当前共有 218 个测试，离线 Prompt、RAG 检索和结构化解读评估均需通过；离线契约与线上解析同样校验首轮 action 的目标 application 证据、结构化追问 action 的证据支持，以及逗号、顿号和常见转折/并列/因果连接词分句不能追加无来源事实。

## DeepSeek 配置

复制 `frontend/.env.example` 为 `frontend/.env.local`，填入后端变量：

```dotenv
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-flash
VITE_READING_ENDPOINT=/api/readings/interpret
```

Vite 本地服务器会挂载两个接口：

- `POST /api/readings/interpret`：发送已确定的牌局和对话，返回解读。
- `POST /api/spreads/recommend`：根据问题推荐牌阵。

密钥只能放在 `DEEPSEEK_API_KEY`，不要使用 `VITE_` 前缀。接口只允许本机调用，并会校验牌面、正逆位、请求大小、来源、并发和超时。首轮模型输出必须逐牌引用固定牌义、让正文和合读与证据相符、用核心锚点完成合读、为行动建议提供证据、在 advice/comparison 目标有 application 证据时让每条行动都引用对应 application、与证据相符的理由和可观察完成标准，并拒绝“保证一定会”之类的绝对预测；健康、法律、投资等高风险问题还必须包含现实依据边界。只有主题和回答目标都开放的问题才会先进入只提一个具体问题的澄清分支；已经明确多个目标的 mixed 问题直接按目标分段回答，不能同时返回部分牌义。若 JSON 结构偶发不合约，后端最多自动修复一次并重新校验。档案与个人知识库不会自动发送给模型。

## 测试

```bash
node --test tests/*.test.mjs
```

包含牌义完整性、固定牌序、随机洗牌、牌阵推荐、DeepSeek 后端校验、RAG／Prompt 质量门、网站静态资源和 Sites 构建检查。

## 目录

```text
frontend/src/       React 页面、牌局状态、动态海报和弧形牌带
frontend/server/    本地 DeepSeek 与牌阵推荐接口
frontend/public/    78 张牌、背景、BGM 和可选 GLB 资源
frontend/tests/     Node 测试
frontend/qa/        浏览器验收记录与截图
docs/               设计与建模文档
```

## 设计边界

当前女巫使用统一场景插画的动态海报方案，不宣称骨骼 3D、连续口型或真实手指抓牌。旧版 Blender/GLB 模型保留在 `frontend/public/models/`，并通过 `LegacyScene.jsx` 作为后续替换接口。

塔罗解读用于自我反思，不读取他人内心，也不保证未来事件。涉及健康、法律或投资决定时，应以现实信息和专业意见为依据。

## 来源与许可

牌图来源、原典资料、中文编辑方法和生成素材说明见 `frontend/research/tarot/README.md` 与 `frontend/public/assets/generated-assets.md`。牌图许可文件保留在 `frontend/public/assets/cards/LICENSE.txt`。
