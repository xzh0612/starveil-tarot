# 星幕 STARVEIL — 第一版交互前端

## 运行

```sh
npm install
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

打开 http://localhost:4173 。生产构建：`npm run build`。领域测试：`node --test tests/domain.test.mjs`。

运行 RAG／Prompt 离线质量门：

```sh
npm run eval:reading
```

质量门不会调用付费模型，固定检查检索主题是否命中、每张牌是否有正逆位证据、首轮是否逐牌覆盖、引用是否来自本次证据集、回答是否包含可执行动作，以及 system／user 消息是否保留证据边界和 JSON 输出约束。要回归一次真实模型输出，可把响应 JSON 传给 `evaluateReadingFixture`，不需要改动生产接口。

## 当前可操作能力

- 全屏单页：开门、占卜室、牌阵、抽牌、翻牌、阅读面板、档案、图鉴、知识库、设置。
- Three.js 真实 3D 圆桌、相机过渡和 1800 个深度粒子；粒子响应鼠标，卡牌悬浮与抽出/翻转动画。
- 按最新反馈，女巫默认改为原创年轻女性动态立绘 v3：银紫长发、法袍局部飘动、衣料流光和游动粒子。设置中的「查看动态立绘」提供风力与暂停控制。先前程序 3D 模型保留为实验文件，不再作为默认角色。
- Blender 原创程序模型：`public/models/witch.blend` 为源文件，`witch.glb` 为网页资产，`scripts/create-witch.py` 可重建。兜帽、法袍和双臂独立，现有动作是物体级姿态，不是骨骼蒙皮或布料物理。
- 78 张固定 RWS 图案，原图文件始终保持不变，统一牌背。桌面 6 × 13、窄屏 13 × 6，不在每次占卜时生成图片。
- 单牌、三牌、时间流、两条道路、关系、事业、马蹄、凯尔特、十二月和 1–12 张自定义牌阵。牌位语义生效；复杂牌阵第一版以整齐卡片布局展示，尚未逐一做传统几何布局。
- 使用 Web Crypto 拒绝采样 + Fisher–Yates 洗牌。牌局先固定牌序，点击选择真实位置，无重复，留空位。逆位只旋转固定牌图。刷新可继续原牌局。
- 78 张逐牌中文图鉴：图像象征、正逆位、关系、事业、反思问题、牌阵阅读方法及可展开的英文原典；RAG 层按问题和牌位检索这些固定证据。
- 追问 UI、存档回看、后记、JSON 导出、本人确认的知识记录。
- 输入问题后先请求后端推荐 2–3 个牌阵；网络或服务不可用时自动切换到基于主题权重的本地推荐，并明确标注来源。
- 动作、粒子、合成轻音效、逆位设置；遵从系统减少动作偏好，隐藏标签页暂停渲染。

## 明确边界

这是供修改的第一版前端。当前女巫模型的雕刻、布料和手部精度与概念图仍有差距，不能宣称一模一样。背景保留概念图的拱窗与紫色星空美术，通过独立远景资产和实时模型组合。

没有配置后端时，解读会明确标记为本地牌义示例；配置后支持 DeepSeek 多轮追问。补牌、语音、用户登录、云端数据库尚未接入。所有记录存在当前浏览器；尚不支持导入、跨设备同步或自动备份。

## 女巫模型与动作接口

`src/services.js` 的 `witchModelConfig` 配置资源地址与片段名。可设置 `VITE_WITCH_MODEL_URL` 换入标准 GLB。`Scene` 接收：

```ts
type WitchAction = 'idle' | 'listening' | 'thinking' | 'drawing' | 'speaking';
type SceneProps = {
  view: 'entry' | 'sanctum' | 'shuffle' | 'draw' | 'reading';
  action: WitchAction;
  motion: boolean;
  particles: boolean;
  representation: 'cinematic' | 'model';
  onStatus: (status: string) => void;
};
```

GLB 中存在对应片段时使用 AnimationMixer 并在 0.35 秒内交叉过渡；当前模型没有片段时使用呼吸、转向与手臂姿态。替换模型需保持米制、Y-up、面向 +Z、原点位于角色底部。模型创建脚本的 Blender Z-up 由 glTF 导出转换。

## AI 接口

在 `.env.local` 设置 `VITE_READING_ENDPOINT` 指向自己的后端，重启前端。供应商密钥只能存在后端。

```ts
// POST to VITE_READING_ENDPOINT
type Request = {
  sessionId: string;
  question: string;
  deckVersion: 'rws-1909-v1';
  spread?: {id: string; name: string; description: string; positions: string[]};
  cards: {id: string; reversed: boolean; position: string}[];
  messages: {role: 'user' | 'assistant'; text: string}[];
  memories?: {id: string; text: string; enabled: boolean; source?: string | null}[];
};
type Response = {
  text: string;
  source: 'ai';
  needsClarification?: boolean;
  clarification?: string;
  cardReadings?: {cardId: string; position: string; reading: string; evidenceIds: string[]}[];
  references?: {evidenceId?: string; cardId: string | null; position: string | null; claim?: string; source?: string; sourceLabel?: string; url?: string | null}[];
  followUp?: string;
  uncertainty?: string;
  evidenceMeta?: {coverageStatus: 'complete' | 'anchor_only' | 'incomplete'};
};
type ErrorResponse = {error: string; code?: string};
```

前端 `src/services.js` 会解析这个错误信封：不展示上游原始响应，只把稳定 `code` 转成可理解的提示，并保留当前牌局供用户重试。成功响应若缺少 `text` 会标记为 `invalid_response`。

首轮明确问题必须覆盖每张牌、返回综合 `synthesis`、非空 `uncertainty` 和至少一条 `actions`；服务端会校验每条行动的 `evidenceIds` 至少包含核心牌义、问题应用语义或本人确认的记忆，并在健康、法律、投资等高风险问题缺少现实边界时拒绝该响应。`evidenceMeta.coverageStatus` 为 `anchor_only` 或 `incomplete` 时，Prompt 要求模型收窄结论并明确不确定。若 `retrievalMeta` 判断问题为 `open` 或 `mixed`，模型可以返回 `needsClarification: true` 和一个具体 `clarification` 问题，此时不会被迫编造逐牌解读。若首轮 JSON 不合约，后端最多追加一次只针对结构修复的请求，并附带稳定校验码，再走同一套牌面、证据和安全校验；追问可以只返回相关牌位，行动清单也可以为空。

后端只解读已确定的牌，不能重新选择牌。已知牌阵会在服务端与目录位置逐项校验，避免把“关系之镜”的牌位套成通用含义。`server/reading-rag.mjs` 会为每张牌保留正逆位和图像象征，再按问题、牌位和主题补充关系／事业、反思问题、Waite 原典或 Corpora 片段；每条证据有稳定 `evidenceId`。只有你在知识库中明确启用的记录才会按相关性作为 `memoryEvidence` 发送，并与牌义证据分开。Prompt 要求模型返回引用，服务端拒绝不属于本次牌局的引用。异常时显示重试并保留牌局。

`server/reading-eval.mjs` 提供不联网的检索、Prompt 和首轮解读回归评分；它复用生产环境的 `retrieveReadingEvidence` 与 `parseReadingOutput`，因此质量门检查的就是实际发送和校验的协议。`requiresProfessionalBoundary` 会识别健康、法律、投资等高风险问题；这类模型输出若缺少 `uncertainty` 现实边界，后端会拒绝返回。

## 资源与来源

- 详细牌义：参考 [Waite 原典](https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_3) 与 [Corpora 开放数据](https://github.com/dariusk/corpora/blob/master/data/divination/tarot_interpretations.json)。中文为编辑性综合，来源与方法见 `research/tarot/README.md`；覆盖测试：`node --test tests/card-guides.test.mjs`。

- 星幕背景、大门、统一牌背、织物贴图：本项目生成资产，见 `public/assets/generated-assets.md`。
- 78 张 RWS 历史牌图：https://github.com/metabismuth/tarot-json/tree/master/cards ，原画 Pamela Colman Smith / Arthur Edward Waite，1909；源仓库 MIT 声明保留在 `public/assets/cards/LICENSE.txt`。源图未修改，网页仅做轻微显示滤镜。
- 图标：Phosphor Icons；字体 Noto Serif SC + 系统宋体回退。
- 动画接口依据 Three.js 官方文档：https://threejs.org/manual/en/animation-system.html 和 https://threejs.org/docs/pages/GLTFLoader.html 。

## 视觉与功能验收

`qa/` 保存真实浏览器截图。`design-qa.md` 记录实际差距与验证范围，不用构建成功替代视觉验收。
