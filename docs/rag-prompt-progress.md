# Starveil Tarot：RAG 与 Prompt 已完成部分说明

> 这份文档是给 RAG 新手看的项目说明。它记录当前代码已经解决的问题、解决方式、代码例子和验证结果。
>
> 按本轮要求，这个文件只保存在本地，不提交 GitHub，也不参与当前分支的发布。

## 1. 先用一句话理解这个系统

用户输入问题后，系统不会直接把问题丢给 DeepSeek，而是先经过一条可检查的流程：

```text
用户问题
  ↓
问题路由：主题 + 目标
  ↓
检索固定牌义、牌位语义、参考资料和用户记忆
  ↓
按照预算整理证据
  ↓
把证据、牌阵、历史对话和规则放入 Prompt
  ↓
DeepSeek 返回结构化 JSON
  ↓
服务端解析 JSON、检查引用、检查安全边界
  ↓
返回网页需要的解读结果
```

这里有三个核心概念：

- **RAG**（Retrieval-Augmented Generation，检索增强生成）：回答前先从知识库找相关证据，再让模型根据证据回答。
- **Prompt**：给模型的工作协议，规定它能使用什么、必须输出什么、哪些事情不能声称。
- **校验器**：模型输出后再检查 JSON、牌位覆盖、证据引用和安全边界。模型说得通顺，不代表它一定有证据。

当前版本号是：

| 部分 | 版本 | 作用 |
| --- | --- | --- |
| 固定牌义与 RAG | `rws-1909-rag-v55` | 固定 78 张牌、检索和证据覆盖规则 |
| 个人记忆检索 | `memory-keyword-v3` | 只召回用户主动启用且相关的记忆 |
| Prompt 协议 | `nyx-prompt-v47` | 定义模型输入、输出 JSON 和引用规则 |

主要代码文件：

- [`frontend/server/reading-rag.mjs`](/Users/yzh/Documents/ChatGPT/vibecoding/frontend/server/reading-rag.mjs)：牌义语料、路由、检索、记忆和证据元数据。
- [`frontend/server/readings.mjs`](/Users/yzh/Documents/ChatGPT/vibecoding/frontend/server/readings.mjs)：Prompt、DeepSeek 调用、结构化输出解析和安全校验。
- [`frontend/tests/reading-rag.test.mjs`](/Users/yzh/Documents/ChatGPT/vibecoding/frontend/tests/reading-rag.test.mjs)：RAG 和路由测试。
- [`frontend/tests/readings.test.mjs`](/Users/yzh/Documents/ChatGPT/vibecoding/frontend/tests/readings.test.mjs)：Prompt、接口和安全测试。
- [`frontend/tests/reading-eval.test.mjs`](/Users/yzh/Documents/ChatGPT/vibecoding/frontend/tests/reading-eval.test.mjs)：离线评测用例。
- [`frontend/scripts/evaluate-reading.mjs`](/Users/yzh/Documents/ChatGPT/vibecoding/frontend/scripts/evaluate-reading.mjs)：运行离线评测。

## 2. 已经完成的能力

目前已经完成的核心能力包括：

1. 固定 78 张 RWS 牌义，不会因为每次调用模型而重新生成牌面含义。
2. 每张牌都有正位、逆位、象征、关系、事业和问题引导等必要字段。
3. 根据问题区分关系、事业、选择、未来和反思等主题。
4. 根据问题区分建议、预测、解释和比较等目标。
5. 保证每张抽出的牌都有核心牌义锚点（anchor）。
6. 根据牌位和问题补充应用层证据（application）。
7. 外部资料只能补充，不能覆盖固定牌义。
8. 用户自己的记忆只能调整措辞和行动建议，不能变成新的牌义。
9. 历史对话会限长，避免 Prompt 无限增长。
10. 模型必须返回结构化 JSON，服务端会解析和检查引用。
11. 能识别“对方到底怎么想”这类无法验证的内心推测，并要求回答保持不确定性。
12. 能识别停药、签合同、买房、投资、诉讼等高风险动作，并要求加入现实核验或专业建议。
13. 混合问题会拆成多个目标分别回答，不再把“为什么”和“下一步怎么办”混成一段。
14. 有离线评测，不依赖 DeepSeek 网络调用也能检查路由、检索和回答结构。

## 3. 问题一：模型会不会自己编牌义？

### 以前的问题

如果把“塔罗牌 + 用户问题”直接交给模型，模型可能会：

- 把不存在的牌义当成事实；
- 把不同网站的说法混在一起；
- 同一张牌在不同回答里含义漂移；
- 因为随机性导致牌面解释前后不一致。

这对于固定牌组尤其危险，因为用户希望同一张牌的基础含义稳定。

### 现在的解决方式

系统把固定牌义作为最高优先级的 `canonical_fixed` 来源，并在启动时检查 78 张牌是否都完整。

`frontend/server/reading-rag.mjs` 中的版本和语料检查如下：

```js
export const READING_KNOWLEDGE_VERSION = 'rws-1909-rag-v55';
export const MEMORY_RETRIEVAL_VERSION = 'memory-keyword-v3';

export function validateReadingCorpus() {
  // 检查 78 张牌是否都有必要的固定牌义字段
  // 缺少字段时直接抛错，而不是让模型临时补写
}

export const READING_CORPUS_STATUS = validateReadingCorpus();
```

每张牌至少需要这些内容：

```text
upright      正位含义
reversed     逆位含义
symbolism    象征信息
relationships 关系语义
work         事业语义
question     问题引导
```

### 来源的优先级

Prompt 里把来源分为四类：

| 来源 | 含义 | 能否覆盖固定牌义 |
| --- | --- | --- |
| `fixed_card_meaning` | 项目维护的固定牌义 | 可以作为权威来源 |
| `external_reference` | Waite 或现代资料 | 只能补充语境 |
| `personal_memory` | 用户主动启用的个人记忆 | 只能调整表达和行动建议 |
| `other` | 未知来源 | 不能直接当成牌义 |

Prompt 中的实际规则是：`canonical_fixed` 是固定牌义权威；历史原典和外部资料不能覆盖正逆位与核心含义；个人记忆也不能成为牌义。

这样做的结果是：模型可以参考资料，但不能因为某个网页或某条个人记忆，就把“这张牌在本项目中的固定含义”改掉。

## 4. 问题二：检索结果会不会混在一起？

### 以前的问题

简单的关键词检索经常会出现两个问题：

1. 用户问感情，却检索出大量事业语义。
2. 当前牌位的语义不明显，模型只拿到了通用牌义，回答变得空泛。

### 现在的解决方式：先路由，再检索

系统先分析主题和目标，然后用它们决定要找哪类证据。

```js
const GOAL_REQUIRED_TIERS = {
  advice: 'application',
  comparison: 'application',
  forecast: 'reference',
  explanation: 'anchor',
};
```

这段代码的意思是：

- 用户要**建议**，优先找能落到行动的 `application` 证据；
- 用户要**比较**，也需要 `application` 证据，因为要比较条件和代价；
- 用户要**预测**，优先使用 `reference` 参考层，并把结果说成趋势，而不是保证；
- 用户要**解释**，优先从 `anchor` 核心牌义解释原因和线索。

检索不是只按“命中多少关键词”排序，还会保留每张牌的固定锚点，给每张牌设置数量上限，再用全局预算裁剪低优先级证据。这样不会因为某一张牌命中很多词，就把其他牌挤出上下文。

服务端还会生成 `coverageStatus`：

- `complete`：每张牌有核心锚点和当前主题需要的应用证据；
- `anchor_only`：只有核心牌义，应用层不足，回答要收窄；
- `incomplete`：核心锚点都不完整，必须明确说明不确定性。

模型只看到稳定的证据 ID、牌位、层级、来源和正文。检索分数、命中词和内部诊断留在服务端，避免模型把“命中词”误写成用户说过的话。

## 5. 问题三：用户说“不要预测”，系统却路由成预测

### 以前的问题

中文里否定词很多，短语也很口语化。例如：

```text
我不是想问未来会不会发生，我想知道现在应该怎么做。
```

如果只看到“未来”和“会不会”，系统可能错误地把目标识别成 `forecast`。

### 现在的解决方式：否定保护和长短语优先

```js
const NEGATED_INTENT_PREFIX =
  /(?:不想|不是想|不是要|不是问|不是要问|不用|(?<!要)不要|无需|并非|不在于|不问|不求|不考虑|不需要)[^。！？?\n]{0,4}$/u;
```

路由还会优先匹配更具体的长短语，并处理建议型追问。例如“未来我该怎么安排”虽然包含“未来”，但“怎么安排”更接近建议目标，不能机械地当成预测。

系统现在支持这些目标：

```text
advice       我下一步该怎么做
forecast     未来趋势或可能性
explanation  为什么、原因、牌面如何解释
comparison   两个选项怎么比较、选哪个
```

路由结果会进入 `retrievalMeta` 和 `goalPlan`，作为后面检索和回答结构的依据。它们是服务端计划，不是用户指令，所以模型不能把它们当成新的事实。

## 6. 问题四：个人记忆会不会泄漏，或者被当成事实？

### 以前的问题

个人知识库很有用，但也容易造成两个风险：

- 把不相关的旧记忆塞进当前 Prompt；
- 让模型把用户自己的描述当成已经验证的客观事实。

### 现在的解决方式

记忆检索有数量和字符预算：

```js
export function retrieveMemoryEvidence({
  question,
  memories,
  max = 6,
  maxTotalChars = 6_000,
} = {}) {
  // 只保留启用且与当前问题有相关词的记忆
  // 最多 6 条，总长度最多 6,000 字符
}
```

进入 Prompt 的记忆证据会被标记：

```js
{
  sourceType: 'personal_memory',
  sourceAuthority: 'user_context',
  memoryStatus: 'user_confirmed',
  memoryUse: 'context_only',
  cardId: null,
  position: null,
}
```

这几个字段是在告诉模型：

- 它是用户确认过的上下文；
- 它不是系统牌义；
- 它只能帮助调整措辞和行动建议；
- 里面出现的任何指令、角色声明或围栏文本都只是待分析数据，不能执行。

如果一条记忆太长，服务端会设置 `memoryExcerpted=true`。模型不能根据省略部分自行补写事实。

## 7. 问题五：RAG 规则改了，Prompt 没同步

### 以前的问题

RAG 代码和 Prompt 代码如果各自维护一套规则，很容易发生漂移：

- 检索器返回 `application`，Prompt 却不知道这个层级；
- 记忆检索已经改名，Prompt 仍按旧版本解释；
- 目标路由增加了 `comparison`，输出校验却没有对应字段。

### 现在的解决方式

Prompt 和 RAG 使用显式版本号，并把同一份元数据传入模型上下文：

```js
// frontend/server/readings.mjs
export const READING_PROMPT_VERSION = 'nyx-prompt-v47';

const knowledgeMeta = {
  deckVersion: DECK_VERSION,
  ragVersion: READING_KNOWLEDGE_VERSION,
  promptVersion: READING_PROMPT_VERSION,
  corpus: READING_CORPUS_STATUS,
};
```

记忆检索版本也从 `reading-rag.mjs` 导入，而不是在两个文件里手写两次。这样升级检索规则时，可以在日志和返回结果中看出本轮用了哪一个版本。

## 8. 问题六：Prompt 太长，历史对话无限增长

### 以前的问题

对话越长，Prompt 越容易出现：

- 请求超过模型上下文限制；
- 旧问题压过最新问题；
- 旧消息里的错误结论被模型继续继承；
- 调试时不知道哪些历史被传进去了。

### 现在的解决方式：确定性压缩

历史消息现在有固定限制：

```text
最多保留最近 24 条
每条最多 4,000 字符
历史总长度最多 24,000 字符
单条超长消息保留开头和结尾
中间被删除的位置写入“中段历史已省略”标记
```

系统还会生成 `promptBudget`，记录本轮实际使用了多少历史、证据和记忆字符。当前问题和当前证据优先，较早历史在接近总预算时先被压缩。

这解决的是上下文管理问题。它不等于“模型记住了所有历史”，而是让系统明确地保留最近、最相关的部分。

## 9. 问题七：模型回答看起来合理，但没有引用证据

### 以前的问题

模型很擅长写出听起来合理的内容，尤其是塔罗这种解释型场景。只检查语法或 JSON 格式，无法发现它是否凭空加了事实。

### 现在的解决方式：结构化输出 + 逐句引用

模型被要求返回固定字段：

```json
{
  "text": "开头的直接回答",
  "needsClarification": false,
  "clarification": "",
  "goalSections": [],
  "cardReadings": [],
  "synthesis": "",
  "actions": [],
  "references": [],
  "followUp": "",
  "uncertainty": ""
}
```

每个关键判断都要在 `references` 中指向真实的 `evidenceId`，并写出与证据共享具体概念的 `claim`。校验器会检查：

1. JSON 是否可以解析；
2. 必填字段是否存在；
3. 每张牌是否被覆盖；
4. 引用的证据 ID 是否真的存在；
5. 文本中的实质句是否与引用证据共享具体词或可验证短语；
6. 是否追加了证据里没有的事实。

如果第一次输出不合格，服务端最多发起一次有边界的修复请求。修复请求会带上 `repairCode` 和具体的 `repairGuidance`，而不是让模型无限重写。

这意味着“语言流畅”只是第一关，“能被当前证据支持”才是第二关。

## 10. 问题八：会不会把对方的内心当成事实？

### 以前的问题

例如用户问：

```text
他现在到底怎么想？他是不是还爱我？
```

牌面无法验证另一个人的真实内心。如果模型直接回答“他其实很爱你”，就会制造错误确定性。

### 现在的解决方式

服务端会识别关系中的内心推测：

```js
const PERSPECTIVE_RELATION_PATTERN =
  /(?:他|她|对方|对象|伴侣|前任|那个人)[^。！？?\n]{0,10}(?:爱我|喜欢我|在乎我|想我|有好感|有感觉|什么态度|是什么态度|对我是什么感觉)/u;
```

命中后，Prompt 要求 `uncertainty` 明确说明：

- 牌面只能提供象征性的观察角度；
- 不能验证对方的真实想法或感受；
- 可以通过沟通、现实互动和可观察行为进行核验。

这保留了塔罗解读的体验，同时避免把猜测写成事实。

## 11. 问题九：健康、法律和金钱问题会不会给出危险动作？

### 以前的问题

用户可能把塔罗问题和真实决定混在一起：

```text
我是不是应该停药？
这个合同可以直接签吗？
我现在应该买房或投资吗？
```

模型如果只追求“给答案”，可能会直接给出不可逆行动。

### 现在的解决方式

系统会识别高风险词，例如停药、换药、买房、合同、起诉、贷款、投资、保险等。命中后，回答必须：

- 明确塔罗不能替代医生、律师或持牌金融专业人士；
- 把牌面写成反思和风险提示；
- 把行动改成现实核验，例如阅读合同、咨询医生、核对费用和退出条件；
- 不能直接输出“现在就签”“马上停药”“一定买入”。

服务端还会拦截绝对预测，例如“保证一定会”“绝对会发生”，以及没有依据的确定日期。

这不是为了让回答变得冷漠，而是把不可逆决定交还给现实证据和合格专业意见。

## 12. 问题十：一个问题里同时有多个目标

### 典型例子

```text
为什么我们会变成这样？接下来我该怎么沟通？
```

这里至少有两个目标：

- `explanation`：解释原因；
- `advice`：给出下一步建议。

### 现在的解决方式

服务端建立 `goalPlan`，把每个目标对应的证据和回答顺序保存下来。混合问题必须输出多个 `goalSections`，每个目标一段，并且每段只能使用对应目标的证据。

回答顺序会变成：

```text
解释：先用 anchor 说明牌面线索和可能原因
建议：再用 application 落到用户能控制的沟通动作
```

这样“为什么”和“怎么办”不会被合成一个没有边界的大判断。

## 13. 一个完整例子：系统如何处理一条问题

假设用户输入：

```text
他对我现在是什么态度？我下一步该怎么沟通？
```

系统大致会这样处理：

1. **路由主题**：识别为关系主题。
2. **路由目标**：识别为 `explanation` + `advice` 的混合目标。
3. **安全边界**：命中“对方态度”，启用内心推测边界。
4. **检索**：每张牌先保留 `anchor`，再为解释目标找核心线索，为建议目标找 `application`。
5. **Prompt**：告诉模型不能声称知道对方内心，必须把核验方式落到沟通和可观察行为。
6. **结构化回答**：输出两个 `goalSections`，先解释牌面线索，再给出可以控制的沟通动作。
7. **输出校验**：检查两个目标都被覆盖，引用的 evidence ID 存在，`uncertainty` 包含内心不可验证说明。

一个合格的回答方向应该是：

```text
从牌面象征看，当前互动可能呈现某种犹豫或防御的线索，
但牌面不能验证对方真实的内心。
如果你要推进沟通，可以先提出一个具体、低压力的问题，
再根据对方是否回应、回应是否具体来判断下一步。
```

注意，这里没有把“他一定怎么想”写成事实，而是把牌面、解释和现实验证分开了。

## 14. 我修改代码时采用的思路

以后你自己改 RAG，可以按下面的顺序做：

1. 先定义这个新能力属于**路由、检索、Prompt 还是输出校验**。
2. 尽量只在对应层修改，不要把所有规则塞进 Prompt。
3. 给新字段增加稳定名字和版本说明。
4. 为一个正常例子、一个边界例子、一个反例加测试。
5. 跑离线评测，确认原来的问题没有退化。

例如要增加一个新的问题目标，可以按这个思路：

```js
// 1. 在路由词典里增加目标词
// 2. 在这里规定该目标优先使用哪一层证据
const GOAL_REQUIRED_TIERS = {
  advice: 'application',
  comparison: 'application',
  forecast: 'reference',
  explanation: 'anchor',
  // newGoal: 'application',
};

// 3. 在 Prompt 中规定 newGoal 的回答结构
// 4. 在 parseReadingOutput / 输出校验中检查该结构
// 5. 在 reading-eval.test.mjs 添加覆盖用例
```

不要只增加 Prompt 文字而不增加测试。那样看上去规则变多了，实际却无法确认模型是否真的遵守。

## 15. 当前限制和下一步可以优化的地方

当前实现已经是可运行的本地 RAG，但仍有清晰边界：

- 默认检索以确定性的关键词和规则为主，没有强依赖向量数据库。
- 语义 reranker 是可选接口，超时或不可用时会回退到离线规则。
- 固定牌义需要人工维护，不能把网上资料自动当成权威。
- 塔罗解读仍然是象征性解释，不能变成事实预测或专业诊断。
- 公开部署时，DeepSeek API Key 必须放在服务端；GitHub Pages 这种纯静态站点不能安全代理付费 API。
- 如果未来多人使用，应该增加登录、用户隔离、后端数据库、配额和审计日志。
- 如果未来加入向量检索，仍要保留当前的固定锚点、来源等级、证据预算和输出校验，不能只把关键词检索替换成向量相似度。

比较稳妥的下一步顺序是：

1. 先增加更多真实问题的离线评测集。
2. 再维护固定牌义和外部参考资料的来源记录。
3. 再接入可选的向量召回或 reranker，并与当前规则检索做对比。
4. 最后再考虑多用户后端和在线个人知识库。

## 16. 如何验证当前实现

在项目根目录运行：

```bash
# 全部 Node 测试
node --test frontend/tests/*.test.mjs

# 离线 RAG / Prompt / 阅读评测
npm --prefix frontend run eval:reading

# 前端生产构建
npm --prefix frontend run build

# 生产依赖审计
npm --prefix frontend audit --omit=dev
```

当前已验证结果：

- Node 测试：294 项通过。
- 离线评测：prompt、retrieval、reading、followUp 均为 100 分。
- Vite 构建：通过；存在一个大 chunk 提示，但不影响构建结果。
- 生产依赖审计：0 个漏洞。
- 最近一次 GitHub Actions：通过。

## 17. 新手看代码的推荐顺序

第一次阅读时，不要从完整 Prompt 的几百行规则开始。建议按这个顺序：

1. 看 `reading-rag.mjs` 顶部的版本号和 `validateReadingCorpus()`，理解知识从哪里来。
2. 看 `analyzeReadingQuestion()` 附近的主题和目标词，理解问题如何被路由。
3. 看 `retrieveReadingEvidence()`，理解 anchor、application、reference、personal 的区别。
4. 看 `retrieveMemoryEvidence()`，理解个人记忆如何限量进入上下文。
5. 看 `readings.mjs` 的 `createPromptBudget()`，理解历史为什么会被压缩。
6. 看 `parseReadingOutput()` 和修复逻辑，理解模型输出为什么还要再次检查。
7. 最后看三个测试文件，把每条规则对应到一个可运行的例子。

如果你能回答下面四个问题，就已经掌握了这个项目的主线：

```text
1. 固定牌义和用户记忆，谁的优先级更高？
2. 用户问建议和问预测时，检索层级有什么不同？
3. 为什么模型必须引用 evidenceId？
4. 为什么“他爱不爱我”不能直接回答成事实？
```

对应答案分别是：固定牌义更高；建议优先 application、预测优先 reference；为了检查回答是否有证据；因为牌面不能验证另一个人的真实内心。

## 18. 本轮继续改进记录（2026-09-22）

### 18.1 个人知识库从“长期允许”拆成“本局允许”

之前的调用链把 `memories.filter(m => m.enabled)` 直接传入解读请求。这个判断只回答“这条记录是否可以成为候选”，没有回答“用户是否允许本局读取”。因此追问旧牌局时，个人信息可能无意中进入 Prompt。

现在新增 `session.usePersonalMemory`，新会话默认 `false`。UI 只有在用户打开“本局使用我的知识库”后才发送 `usePersonalMemory:true`；`services.js` 负责把字段传输到后端；`readings.mjs` 服务端再次校验，只有严格为 `true` 才执行 `retrieveMemoryEvidence()`。这形成了前端体验和后端安全两道门。

服务端还返回 `memoryMeta`：本局是否启用、候选数、实际召回数和检索版本。它的价值是把权限和检索事实变成可观察数据，后续排查“模型为什么提到这条记忆”时不需要猜。

### 18.2 中文词法召回修正

本轮加入 `GENERIC_QUERY_TERMS`，过滤“如何、怎么、怎样、是否”等只表达意图、不表达主题的查询词。过滤发生在查询侧，不改知识库正文，也不改变主题/目标路由。例如“怎么处理这段关系”仍会进入 relationship + advice 路由，但“怎么”不会单独把某段反思文字抬成相关证据。

新增回归测试：`retrieval does not treat generic question words as topical evidence`。这是一次小而明确的 RAG 改良：减少假命中，同时保留可解释的 `retrievalDirectTerms`。

### 18.3 尚未完成的下一步

当前仍不能声称 RAG 已经“无需再改”。下一步需要补充人工标注的真实问题集，测量 `Recall@k`、目标层级覆盖、无关证据率和延迟；然后在保持本地词法基线的情况下，实验性加入 dense 召回，并用 RRF 合并，而不是未经评测就替换现有检索。向量数据库、ColBERT、SPLADE、HyDE、GraphRAG 和大规模 ANN 索引目前都不应默认加入这个 78 张牌的小语料项目。

## 19. BM25 全牌局统计（2026-09-22）

旧版每张牌只用自己的候选 chunk 计算 BM25 IDF，统计范围过窄。现在 `collectReadingEvidence()` 先构造本轮所有合法牌的 `globalCorpus`，再给每张牌评分，并把诊断版本改为 `bm25+rules+expansion-v2`。这样常见词的区分度会基于整局候选集合计算，而不是基于单张牌的局部集合。

这项改动没有删除固定锚点，也没有让分数单独决定最终证据；锚点、牌位语义、目标层级和全局预算仍然优先。新增测试验证多牌局使用全局候选语料，299 个全量测试和四项离线评测继续通过。真正的效果仍需后续人工标注集验证，不能只根据分数变化宣称召回质量已经提升。
