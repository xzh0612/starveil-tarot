# WorkBuddy 聊天界面解剖（REA 逆向 · 2026-10-19）

> 来源：`/Applications/WorkBuddy.app/Contents/Resources/app.asar` 内
> `renderer/assets/lib-chat-ui-B1cKgDdf.js`（9.96 MB）+ `lib-chat-ui-P79XYQqL.css`（1.43 MB）。
> 分析方式：REA `analyze_javascript_application`（asar 完整性不匹配项为打包后签名所致，已按
> `record-and-continue` 记录为不可信字节，与聊天界面无关）；类名与规则直接读 CSS 原文。
> 原始抽取物在 `output/rea/`（`workbuddy-chat-ui.css`、`lib-chat-ui.js`）。

## 1. 整体层级

```
message-list-viewport        相对定位 flex 列
└─ message-list              flex:1 · overflow-y:auto · container-type:inline-size
   └─ message-list__content  max-width:100% · margin:auto · padding-inline:16px
      ├─ frame--left   助手回合  padding:16px 0 · 内容宽 100% · 正文 13px
      ├─ frame--right  用户回合  justify-end · padding-bottom 预留 28px（hover 操作位）
      └─ frame--center 系统事件  居中 · 12px · 三级文字色
```

回合之间无相邻选择器，间距完全由 `frame` 自身的 `padding: 16px 0` 提供。

## 2. 助手回合 `.cr-agent`

```
agent                        flex 列
├─ agent__header             flex · align-center · gap:10px · margin-bottom:12px
│  ├─ agent__logo            24×24 圆形（ overflow:hidden · border-radius:50% ）
│  └─ agent__name            品牌字体 · 14px/600/1.75 · 主文字色
└─ 内容块（markdown / collapse / reasoning / tool-call …）
```

## 3. 用户回合 `.cr-self-message`

```
self-message                 flex · justify-end · gap:8px · align-flex-start
└─ self-message__content     列 · align-end · gap:4px
   └─ self-bubble            width:fit-content · max-width:100% · min-width:40px
                             padding:8px 12px · border-radius:16px 16px 0 16px
                             13px/19px · max-height:310px + 内部 4px 细滚动条
```

气泡尾在右下角（BR=0），右上不对齐。`--discarded` 态：`grayscale(1) + opacity:.48`。

## 4. 折叠系统 `.cr-collapse`（步骤行/折叠行的原型）

```
collapse                     flex 列
├─ collapse__header          flex · width:fit-content · gap:8px · line-height:1.75
│                           颜色 = 三级文字色（最弱的那档）
│  └─ collapse__icon         收起时 rotate(-90deg) 且 opacity:0；header hover 时才显形
└─ collapse__content         height:auto · interpolate-size:allow-keywords
                             overflow:hidden · contain:layout paint
                             transition: height .28s cubic-bezier(.33,1,.68,1), opacity .2s
   └─ collapse__content-inner  opacity + translateY(.28s) 过渡
```

reasoning 变体：header 15px，内容 `border-left:4px` 导轨 + `padding-left:12px` +
`margin:8px 0 4px` + `line-height:20px` + `max-height:200px`。

## 5. 输入框（composer）

```
input-box                    flex 列 · gap:12px · 14px/1.5
└─ input-container           position:relative · flex 列 · padding-top:12px
                             border:0.5px（发丝线）· border-radius:24px
                             背景 = elevated 面 · box-shadow 输入框阴影
   ├─ input-editor-host      min-height:64px · padding:0 16px · overflow-y:auto
   ├─ input-toolbar          flex · space-between · gap:8px · min-height:32px · padding:12px
   │  ├─ 左侧：挂件按钮 / chips
   │  └─ 右侧：send-button
   └─ input-footer           flex · gap:4px · padding:0 12px · wrap（chips 行）
```

- `--focused`：只换阴影（`shadow-input-container-focused`），不变边框——发丝线常驻。
- banner 贴在容器上方时，共享边线（容器上圆角清零）。
- 快捷操作条 `quick-action-bar`：纵向 chips，gap 8px。
- 引用 chip `input-ref`：`border-radius:999px` · `padding:2px 4px 2px 10px` · 12px。
- 发送键 `send-button`：32×32 正圆 · 透明底 · 颜色令牌；`--sending` 降透明度 ·
  `--stop` 换停止色 · `:disabled` 保持 opacity:1 只换 cursor。

## 6. 令牌值（dark 主题实测）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--cr-internal-bg-elevated` | `#242629` | 输入框/浮层面 |
| `--cr-internal-border-default` | `#2a2c31` | 发丝边（配 0.5px） |
| `--cr-internal-text-primary` | `rgba(255,255,255,.92)` | 正文 |
| `--cr-internal-text-secondary` | `rgba(255,255,255,.65)` | 次级 |
| `--cr-internal-text-tertiary` | `rgba(255,255,255,.45)` | 折叠头/系统行 |
| `--cr-internal-user-bubble-bg` | `rgba(255,255,255,.1)` | 用户气泡（light 为 `#f2f2f2`） |
| `--cr-md-root` | `16px`（消息上下文被覆盖为 13px） | Markdown 根字号 |
| `--cr-md-line-height` | `1.75` | 正文行高 |

标题全部 em 相对值（h1 = 1.25em，weight 600，margin 20px 0 16px），
首/尾子元素 margin 清零——保证块拼接时间距恒定。

## 7. 值得照搬的细节

1. **发丝边框 0.5px**：卡片/输入框的边不是 1px，是 0.5px，配 `#2a2c31` 级深色。
2. **尾角气泡**：`16px 16px 0 16px` 让右对齐气泡有"指向感"，比四角同圆度更生动。
3. **折叠图标默认隐身**：收起态图标 `opacity:0`，hover 才显形——折叠行安静地待在正文里。
4. **底部渐隐 mask**：消息列表底部 72px 线性渐变遮罩，内容滚到边缘时自然消隐。
5. **hover 操作位预留**：用户回合下方预留 28px，操作按钮浮现时不抖动布局。
6. **时间戳 hover 才现**：`message-time-tip` 默认透明，hover 消息行才显形。
7. **流式两件套**：文字流光 shimmer + 生成中块 `opacity:.7`。
8. **细滚动条**：列表 6px/圆角 3px，气泡内 4px/圆角 2px，轨道全透明。
9. **`prefers-reduced-motion`**：所有过渡在该媒体查询下清零。
10. **容器查询**：`message-list` 挂 `container-type:inline-size`，窄栏自动收紧排版。

## 8. 与星幕暗紫主题的映射

保留星幕自己的紫调配色与字体（不抄 WorkBuddy 的中性灰），只移植**结构与度量**：

| WorkBuddy | 星幕取值 |
|---|---|
| 正文 13px / 1.75 | 同 |
| 气泡 8px 12px / 13-19px / 尾角 16 16 0 16 | 同，底色用现有紫调 |
| 输入框 24px 圆角 / 0.5px 发丝 / 64px 编辑区 | 同 |
| 折叠头三级色 + 图标旋转淡出 | 同 |
| reasoning 左导轨 4px | 同（用于解读谱系） |
| 底部 72px 渐隐 mask | 同 |
| 回合 padding 16px 0 | 同 |
| 系统行 12px 三级色居中 | 同 |

## 9. 全屏三栏（2026-10-19 追加）

WorkBuddy 的历史列表属于外壳（app shell），不在 `lib-chat-ui` 里，所以三栏是我们的组合方案，只沿用聊天区的度量：

| 区域 | 宽度 | 内容 | 对应类 |
|---|---|---|---|
| 左栏 | 264px | 历史对话（当前会话置顶、存档条目按时间倒序、点击直切） | `.chat-history` / `.chat-history-item` |
| 中栏 | 自适应 | 复用同一套时间线与 composer | `.chat-main` |
| 右栏 | 300px | 本局牌面（牌图 44px、牌名、牌位、正逆位、关键词） | `.chat-cards` / `.chat-card-item` |

- 面板从 560px 抽屉扩展为 `left/right:2%` 的整宽面板（`.panel.chat.full`），高度沿用 `top:92px;bottom:18px`。
- 断点：≤1180px 收起右栏，≤900px 收起左栏，中栏始终保留。
- 切换会话前会把当前未存档的对话静默写入 history，避免直接切换丢失内容。
- 模型快速切换、语音输入都放在 composer 工具行，不额外占版面。

### 9.1 左右栏收起（2026-10-20 追加）

两侧栏都可单独收起，收起后保留一条 52px 竖边栏，点一下就展开：

| 状态 | 列宽 | 标记 | 交互 |
|---|---|---|---|
| 展开 | `264px / 1fr / 300px` | 无附加类 | header 右侧 `‹` `›` 按钮收起 |
| 左收起 | `52px / 1fr / 300px` | `.chat-full.left-collapsed` | 竖条按钮 `展开历史对话` |
| 右收起 | `264px / 1fr / 52px` | `.chat-full.right-collapsed` | 竖条按钮 `展开本局牌面` |
| 都收起 | `52px / 1fr / 52px` | 两个类 | 各自独立恢复 |

- 列宽用 CSS 变量 `--rail-l` / `--rail-r` 驱动，媒体查询只改变量值，因此窄屏下用户的收起选择不会被覆盖。
- 收起状态存 `starveil:chatRails`（走 `domain.js` 的 `load/save`），刷新与重进面板都保持。
- 竖边栏由 `.chat-rail-expand` 构成：图标在上、`writing-mode:vertical-rl` 竖排标题、末尾是条数。
- 顺带修掉 `.panel.chat .panel-body` 缺少 `flex:1` 的问题——此前三栏高度只到内容高度，全屏面板底部会留大片空白。
