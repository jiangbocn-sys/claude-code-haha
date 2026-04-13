# Claude Code 桌面端 — 功能详解

> 深入每一个功能模块，从聊天引擎到定时任务，全面解析桌面端的能力矩阵。

<p align="center">
<a href="#一聊天引擎">聊天引擎</a> · <a href="#二工具调用系统">工具调用</a> · <a href="#三代码展示系统">代码展示</a> · <a href="#四agent-teams-团队协作">Agent Teams</a> · <a href="#五提供商管理">提供商管理</a> · <a href="#六技能与-agent-定义">技能与 Agent</a> · <a href="#七定时任务系统">定时任务</a> · <a href="#八im-适配器">IM 适配器</a> · <a href="#九设计系统">设计系统</a>
</p>

![功能全景图](./images/06-features-grid.png)

---

## 一、聊天引擎

聊天引擎是桌面端的核心，负责消息的发送、接收、渲染和交互。

### 消息列表（MessageList）

**文件位置**：`desktop/src/components/chat/MessageList.tsx`

消息列表是对话的主展示区域：

- **自动滚动**：新消息到达时 smooth 滚动到底部
- **消息分组**：Tool calls 和对应的 results 按组展示
- **混合渲染**：支持文本、代码、Diff、工具调用等多种内容类型

### 消息类型详解

#### 用户消息（UserMessage）

```
┌──────────────────────────────┐
│ 👤  写一个快速排序算法         │
│     📎 screenshot.png (附件)  │
│                    [复制]     │
└──────────────────────────────┘
```

- 用户头像 + 消息文本
- 附件画廊展示（图片缩略图、文件图标）
- 悬浮显示消息操作栏

#### 助手消息（AssistantMessage）

```
┌──────────────────────────────────┐
│ ┌──────────────────────────────┐ │
│ │ 好的，我来实现快速排序：       │ │
│ │                              │ │
│ │ ```python                    │ │
│ │ def quicksort(arr):          │ │
│ │     if len(arr) <= 1:        │ │
│ │         return arr           │ │
│ │ ```                          │ │
│ │                    [复制] ▍  │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- 带边框的气泡容器
- 完整 Markdown 渲染（标题、列表、表格、引用、链接）
- 代码块使用 Shiki 语法高亮
- 流式输出时显示闪烁光标 `▍`

#### 思考块（ThinkingBlock）

```
┌──────────────────────────────────┐
│ 💭 思考过程           [展开 ▼]  │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ 让我分析一下用户的需求...     │ │
│ │ 快速排序的时间复杂度是...     │ │
│ │ 我应该用 Lomuto 分区方案...  │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- 默认折叠，显示第一行预览
- 点击展开查看完整推理过程
- 流式更新时显示动画光标
- 自动滚动到最新思考内容

#### 权限请求（PermissionDialog）

```
┌──────────────────────────────────┐
│ ⚠️ 权限请求                      │
│                                  │
│ 工具: Write                      │
│ 文件: /src/sort.py               │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ + def quicksort(arr):        │ │
│ │ +     if len(arr) <= 1:      │ │
│ │ +         return arr          │ │
│ └──────────────────────────────┘ │
│                                  │
│ [允许]  [一直允许]  [拒绝]       │
└──────────────────────────────────┘
```

- 显示工具类型和操作目标
- 预览操作内容（Diff、命令等）
- 可展开查看完整输入参数
- 三个操作按钮：允许 / 一直允许 / 拒绝

#### AskUser 提问

当 AI 使用 `AskUserQuestion` 工具向你提问时，会显示一个专用输入框，你的回答会直接发送给 AI。

#### 内联任务摘要（InlineTaskSummary）

当 AI 创建后台任务时，对话中会内联显示任务的进度和结果摘要。

### 输入系统（ChatInput）

**文件位置**：`desktop/src/components/chat/ChatInput.tsx`

输入框是一个功能丰富的组合组件：

```
┌──────────────────────────────────┐
│ 📎 screenshot.png  ×             │  ← 附件画廊
├──────────────────────────────────┤
│ 🏷️ myproject (main)              │  ← 项目上下文芯片
├──────────────────────────────────┤
│                                  │
│ 输入消息...                       │  ← 可扩展文本框
│                                  │
├──────────────┬───────────────────┤
│ [+]          │           [发送]  │  ← 工具栏
└──────────────┴───────────────────┘
```

**核心功能**：

1. **自适应高度**：文本框随内容自动扩展，最高 200px
2. **附件画廊**：显示待发送的文件/图片
3. **项目上下文芯片**：展示当前 Git 仓库和分支
4. **Plus 菜单**：添加文件 / 插入斜杠命令
5. **斜杠命令菜单**：`/` 触发，支持搜索和键盘导航
6. **文件搜索菜单**：`@` 触发，路径自动补全
7. **快捷键**：Enter 发送、Shift+Enter 换行、Esc 关闭菜单

---

## 二、工具调用系统

当 AI 执行工具操作时，桌面端会以结构化的方式展示工具调用和结果。

### 工具调用块（ToolCallBlock）

**文件位置**：`desktop/src/components/chat/ToolCallBlock.tsx`

每种工具有专门的展示方式：

#### Bash 工具

```
┌──────────────────────────────────┐
│ 🖥️ Bash                          │
│                                  │
│ $ npm install express            │  ← 终端风格
│                                  │
│ 说明: Install express package    │
│                          [展开]  │
└──────────────────────────────────┘
```

使用 `TerminalChrome` 组件模拟终端界面：
- 深色背景
- 绿色提示符 `$`
- 显示命令内容和说明

#### Edit / Write 工具

```
┌──────────────────────────────────┐
│ ✏️ Edit  src/app.ts              │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ - const port = 3000          │ │  ← Diff 视图
│ │ + const port = 8080          │ │
│ └──────────────────────────────┘ │
│                                  │
│ +1 -1 行                         │
└──────────────────────────────────┘
```

- 使用 `DiffViewer` 展示文件变更
- 显示行数统计（+N / -N）
- 自动识别文件语言
- 词级别 Diff 高亮

#### Read 工具

展示被读取的文件内容，使用 `CodeViewer` 语法高亮。

#### Glob / Grep 工具

展示搜索模式和匹配结果。

#### WebSearch / WebFetch 工具

展示搜索关键词或目标 URL。

#### 其他工具

以 JSON 格式展示工具的输入参数，可展开查看详情。

### 工具结果块（ToolResultBlock）

工具执行后的输出展示：

- **成功** → 绿色状态指示 + 输出内容
- **错误** → 红色状态指示 + 错误信息
- 输出以代码块展示，支持语法高亮
- 超长输出自动截断，显示行数摘要

---

## 三、代码展示系统

桌面端在代码展示方面追求**VS Code 级别的体验**。

### CodeViewer

**文件位置**：`desktop/src/components/chat/CodeViewer.tsx`

- **引擎**：Shiki（与 VS Code 相同的语法高亮引擎）
- **主题**：自定义温暖色调主题，与应用设计系统匹配
- **行号**：左侧行号显示
- **折叠**：超过 20 行时自动折叠，点击展开
- **复制**：右上角一键复制按钮

### DiffViewer

**文件位置**：`desktop/src/components/chat/DiffViewer.tsx`

- **引擎**：react-diff-viewer-continued
- **模式**：单列（split view 更紧凑）
- **高亮**：词级别变更高亮
- **统计**：顶部显示 +N/-N 行数变化
- **语言识别**：根据文件扩展名自动识别语言

### MarkdownRenderer

**文件位置**：`desktop/src/components/markdown/MarkdownRenderer.tsx`

- 基于 `marked` 解析 Markdown
- 代码块自动使用 Shiki 高亮
- 支持表格、列表、引用、链接
- 内联代码和粗体/斜体

### Mermaid 图表渲染

支持 Mermaid 图表实时渲染（`MermaidRenderer` 组件），使用 `securityLevel: 'strict'` 安全模式。支持流程图、时序图、甘特图、类图等所有 Mermaid 图表类型。渲染失败时自动回退显示源代码。

---

## 四、Agent Teams 团队协作

![聊天消息流](./images/08-chat-message-flow.png)

桌面端可视化展示 Agent Teams 的协作状态。

### 团队视图（AgentTeams）

**文件位置**：`desktop/src/pages/AgentTeams.tsx`

当 AI 创建 Agent Team 时，桌面端显示团队管理界面：

- **团队列表**：所有活跃团队
- **成员状态**：每个 Agent 的实时状态

| 状态 | 指示 |
|------|------|
| running | 绿色脉冲动画 |
| idle | 灰色 |
| completed | 完成标记 |
| error | 红色错误标记 |

- **成员标签**：彩色标签显示 Agent 角色和名称
- **实时更新**：通过 WebSocket 推送 `team_update` 事件

### 转录视图（AgentTranscript）

点击团队成员可查看该 Agent 的完整对话转录：

- 与主聊天相同的消息渲染
- 支持查看工具调用和结果
- 「返回团队」导航按钮

### TeamStatusBar

**文件位置**：`desktop/src/components/teams/TeamStatusBar.tsx`

在活跃会话底部展示团队状态条：
- 团队名称
- 成员数量和状态分布
- 快速导航到团队视图

---

## 五、提供商管理

桌面端提供了完整的 AI 提供商管理界面。

### 提供商列表

**文件位置**：`desktop/src/pages/Settings.tsx`（Providers 标签页）

展示所有已配置的提供商：

```
┌──────────────────────────────────┐
│ ✅ Anthropic (Official)    [活跃] │  ← 官方提供商
├──────────────────────────────────┤
│ 🔵 OpenRouter              [编辑]│  ← 自定义提供商
│    Base: openrouter.ai/api/v1    │
│    Format: anthropic             │
├──────────────────────────────────┤
│ ⚪ Ollama (Local)          [编辑]│  ← 本地模型
│    Base: localhost:11434         │
│    Format: openai_chat           │
├──────────────────────────────────┤
│            [+ 添加提供商]        │
└──────────────────────────────────┘
```

### 提供商配置

每个提供商可配置：

| 字段 | 说明 |
|------|------|
| 名称 | 提供商显示名称 |
| API Key | 密钥（密码输入，自动脱敏） |
| Base URL | API 基础地址 |
| API 格式 | `anthropic` / `openai_chat` / `openai_responses` |
| 模型映射 | main / haiku / sonnet / opus 槽位对应的模型名 |

### 预设系统

**文件位置**：`desktop/src/config/providerPresets.ts`

点击「添加提供商」时，可从预设快速创建：

- Anthropic
- OpenAI
- OpenRouter
- Ollama
- Azure OpenAI
- Google AI
- 自定义...

预设自动填充 Base URL 和 API 格式，只需填入 API Key。

### 连接测试

配置完成后点击「测试」，系统执行两步验证：

1. **连接性测试** — 发送简单请求验证网络可达
2. **模型可用性测试** — 验证配置的模型是否可用

结果以 Toast 通知展示（成功 / 失败 + 错误信息）。

---

## 六、技能与 Agent 定义

### 技能浏览（SkillList / SkillDetail）

**文件位置**：`desktop/src/components/skills/`

技能库浏览界面：

- **列表视图**：按来源分类（bundled / user / project / plugin）
- **搜索过滤**：按名称和描述搜索
- **详情视图**：
  - 技能元数据（描述、版本、来源）
  - 源代码目录树
  - 代码文件内容（带语法高亮）
  - Frontmatter 属性展示

### Agent 定义管理

**文件位置**：`desktop/src/pages/Settings.tsx`（Agents 标签页）

管理 Agent 类型定义：

| 字段 | 说明 |
|------|------|
| agentType | Agent 类型标识符 |
| description | 描述（何时使用） |
| model | 默认模型（sonnet/haiku/opus） |
| tools | 可用工具列表 |
| systemPrompt | 自定义系统提示词 |
| color | 标识颜色 |

**来源分类**：

| 来源 | 说明 |
|------|------|
| built-in | 系统内置（不可修改） |
| plugin | 插件提供 |
| userSettings | 用户级自定义 |
| projectSettings | 项目级自定义 |
| localSettings | 本地自定义 |

### 关于页面

设置页新增「关于」标签页（About），展示应用名称、版本号、GitHub 仓库链接、作者信息及社交链接。macOS 菜单栏的「关于 Claude Code Haha」菜单项会直接导航到此页面，而非弹出系统默认的关于弹窗。

---

## 七、定时任务系统

### 任务管理页面

**文件位置**：`desktop/src/pages/ScheduledTasks.tsx`

#### 统计卡片

页面顶部三个统计卡片：

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  总计  5  │  │  活跃  3  │  │  禁用  2  │
└──────────┘  └──────────┘  └──────────┘
```

#### 任务列表

每个任务行展示：

```
┌──────────────────────────────────────────────┐
│ 📋 每日代码审查                    [启用 ✓] │
│    每天 09:00 执行                            │
│    cron: 0 9 * * *                           │
│                                              │
│    [运行历史 ▼]  [手动运行]  [删除]          │
│                                              │
│    ┌──────────────────────────────────────┐  │
│    │ 2026-04-10 09:00 ✅ 成功 (12s)       │  │
│    │ 2026-04-09 09:00 ✅ 成功 (8s)        │  │
│    │ 2026-04-08 09:00 ❌ 失败: timeout     │  │
│    └──────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 创建任务

**文件位置**：`desktop/src/pages/NewTaskModal.tsx`

模态框表单：

| 字段 | 组件 | 说明 |
|------|------|------|
| 任务名称 | Input | 描述性名称 |
| 提示词 | PromptEditor | 多行文本编辑器 |
| Cron 表达式 | Input + 解释文本 | 支持标准 Cron 语法 |
| 星期几 | DayOfWeekPicker | 可视化多选星期 |
| 模型 | ModelSelector | 使用的 AI 模型 |
| 权限模式 | PermissionModeSelector | 执行时的权限策略 |

#### DayOfWeekPicker

```
┌───┬───┬───┬───┬───┬───┬───┐
│ 日│ 一│ 二│ 三│ 四│ 五│ 六│
│   │ ✓ │ ✓ │ ✓ │ ✓ │ ✓ │   │
└───┴───┴───┴───┴───┴───┴───┘
```

可视化选择任务执行的星期几，自动更新 Cron 表达式。

### Cron 表达式

使用 `cronDescribe` 工具将 Cron 表达式转换为人类可读描述：

```
0 9 * * 1-5    →  "周一到周五每天 09:00"
*/30 * * * *   →  "每 30 分钟"
0 0 1 * *      →  "每月 1 号 00:00"
```

---

## 八、IM 适配器

### 适配器设置页面

**文件位置**：`desktop/src/pages/AdapterSettings.tsx`

#### 配对管理

```
┌──────────────────────────────────┐
│ 🔐 用户配对                      │
│                                  │
│ 当前配对码: A3K7NP               │
│ 过期时间: 58 分钟后              │
│                                  │
│ [生成新配对码]                    │
│                                  │
│ 已配对用户:                       │
│ ┌──────────────────────────────┐ │
│ │ Telegram │ @john  2026-04-01 │ │
│ │ 飞书     │ 张三   2026-04-05 │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

#### Telegram 配置

| 字段 | 类型 | 说明 |
|------|------|------|
| Bot Token | 密码输入 | Telegram Bot API Token |
| 允许的用户 ID | 逗号分隔 | 静态白名单 |

#### 飞书配置

| 字段 | 类型 | 说明 |
|------|------|------|
| App ID | 文本 | 飞书应用 ID |
| App Secret | 密码 | 飞书应用密钥 |
| 加密密钥 | 密码 | 事件加密密钥 |
| 验证 Token | 密码 | 事件验证 Token |
| 允许的用户 | 逗号分隔 | open_id 白名单 |
| 流式卡片 | 开关 | 是否启用流式消息卡片 |

### 飞书适配器特性

**文件位置**：`adapters/feishu/index.ts`

- **连接方式**：WebSocket 长连接（无需公网地址）
- **消息格式**：飞书 JSON 富文本 → Markdown 文本
- **权限审批**：Interactive Card（卡片按钮）
- **消息更新**：Patch API 编辑已发消息（流式效果）
- **分片发送**：超过 30000 字时自动分片

### Telegram 适配器特性

**文件位置**：`adapters/telegram/index.ts`

- **连接方式**：Polling 模式（Bot 主动轮询）
- **消息格式**：纯文本 + Markdown
- **权限审批**：Inline Keyboard（内联按钮）
- **消息更新**：`editMessageText` 编辑已发消息
- **分片发送**：超过 4000 字时自动分片

### 权限请求在 IM 中的展示

**Telegram**：
```
⚠️ 权限请求
工具: Bash
命令: npm install express
说明: Install express package

[✅ 允许]  [❌ 拒绝]     ← Inline Keyboard
```

**飞书**：
```
┌──────────────────────────┐
│ ⚠️ 权限请求               │
│                          │
│ 工具: Bash               │
│ 命令: npm install express│
│                          │
│ [✅ 允许] [❌ 拒绝]       │  ← Interactive Card
└──────────────────────────┘
```

---

## 九、设计系统

### 颜色体系

桌面端采用**暖色调**设计语言：

**文件位置**：`desktop/src/theme/globals.css`

#### 主色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--color-primary` | #8F482F | 品牌色、CTA 按钮 |
| `--color-primary-container` | #AD5F45 | 品牌色容器 |
| `--color-on-primary` | #FFFFFF | 品牌色上的文字 |

#### 表面色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--color-surface` | #FAF9F5 | 主背景（浅米色） |
| `--color-surface-container` | #EFEEEA | 卡片背景 |
| `--color-surface-container-low` | #F4F4F0 | 次级容器 |
| `--color-surface-container-high` | #E9E8E4 | 高层级容器 |

#### 语义色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--color-secondary` | #2D628F | 信息、链接 |
| `--color-tertiary` | #4F6237 | 成功、确认 |
| `--color-error` | #BA1A1A | 错误、警告 |

#### 文本色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--color-on-surface` | #1B1C1A | 主文本 |
| `--color-on-surface-variant` | #54433E | 次级文本 |
| `--color-outline` | #87736D | 边框 |
| `--color-outline-variant` | #DAC1BA | 弱边框 |

### 字体系统

| 字体 | 用途 | 字重 |
|------|------|------|
| **Inter** | 正文 | 400-600 |
| **Manrope** | 标题 | 400-800 |
| **JetBrains Mono** | 代码 | 400 |

### 图标系统

使用 **Material Symbols Outlined** 图标集，自托管字体：

- 齿轮 → 设置
- 时钟 → 定时任务
- + → 新建
- × → 关闭
- 文件夹 → 项目
- 搜索 → 搜索

### 动画

| 名称 | 效果 | 用途 |
|------|------|------|
| `animate-pulse-dot` | 脉冲闪烁 | 运行中会话指示 |
| `animate-shimmer` | 闪烁光标 | 流式输出光标 |
| slide-in / fade-in | 滑入淡入 | Toast 通知 |

### 通知系统（Toast）

**文件位置**：`desktop/src/components/shared/Toast.tsx`

右下角固定位置的通知组件：

```
                              ┌──────────────────────────┐
                              │ ✅ 提供商连接测试成功     ×│
                              │    所有模型可用            │
                              └──────────────────────────┘
```

四种类型：

| 类型 | 左边框色 | 场景 |
|------|----------|------|
| success | 绿色 | 操作成功 |
| error | 红色 | 操作失败 |
| warning | 黄色 | 警告提示 |
| info | 蓝色 | 信息通知 |

- 自动消失（可配置时长）
- 点击 × 手动关闭
- 从右侧滑入动画

---

## 十、国际化

**文件位置**：`desktop/src/i18n/`

### 支持语言

- **en** — English
- **zh** — 简体中文

### 使用方式

```typescript
// 在 React 组件中
const t = useTranslation()
return <button>{t('common.save')}</button>

// 支持参数插值
t('chat.tokenCount', { count: 1200 })
```

### 翻译 Key 体系

| 命名空间 | 示例 | 说明 |
|----------|------|------|
| `common.*` | save, cancel, delete | 通用词汇 |
| `sidebar.*` | newSession, search | 侧边栏 |
| `chat.*` | sendMessage, thinking | 聊天 |
| `settings.*` | providers, permissions | 设置 |
| `status.*` | connected, error | 状态 |
| `titlebar.*` | appName | 标题栏 |

### 切换语言

在设置 → 通用 中切换语言，设置保存到 `localStorage`，即时生效。

---

## 十一、快速参考

### 组件清单

| 组件 | 路径 | 职责 |
|------|------|------|
| AppShell | `components/layout/AppShell.tsx` | 应用根容器、初始化 |
| Sidebar | `components/layout/Sidebar.tsx` | 侧边栏导航 |
| TabBar | `components/layout/TabBar.tsx` | 标签页管理 |
| ContentRouter | `components/layout/ContentRouter.tsx` | 页面路由 |
| StatusBar | `components/layout/StatusBar.tsx` | 状态栏 |
| ChatInput | `components/chat/ChatInput.tsx` | 消息输入 |
| MessageList | `components/chat/MessageList.tsx` | 消息列表 |
| ToolCallBlock | `components/chat/ToolCallBlock.tsx` | 工具调用展示 |
| CodeViewer | `components/chat/CodeViewer.tsx` | 代码高亮 |
| DiffViewer | `components/chat/DiffViewer.tsx` | Diff 展示 |
| PermissionDialog | `components/chat/PermissionDialog.tsx` | 权限审批 |
| ModelSelector | `components/controls/ModelSelector.tsx` | 模型选择 |
| Toast | `components/shared/Toast.tsx` | 通知系统 |

### Store 清单

| Store | 路径 | 核心状态 |
|-------|------|----------|
| chatStore | `stores/chatStore.ts` | messages, chatState, streamingText |
| sessionStore | `stores/sessionStore.ts` | sessions, activeSessionId |
| tabStore | `stores/tabStore.ts` | tabs, activeTabId, tabOrder |
| settingsStore | `stores/settingsStore.ts` | model, permissionMode, language |
| providerStore | `stores/providerStore.ts` | providers, activeProvider |
| uiStore | `stores/uiStore.ts` | theme, toasts, modals |
| taskStore | `stores/taskStore.ts` | tasks, runs |
| teamStore | `stores/teamStore.ts` | teams, members |

### API 客户端清单

| 模块 | 路径 | 职责 |
|------|------|------|
| client | `api/client.ts` | HTTP 基础客户端 |
| websocket | `api/websocket.ts` | WebSocket 管理器 |
| sessions | `api/sessions.ts` | 会话 CRUD |
| providers | `api/providers.ts` | 提供商管理 |
| models | `api/models.ts` | 模型操作 |
| tasks | `api/tasks.ts` | 定时任务 |
| teams | `api/teams.ts` | Agent 团队 |
| agents | `api/agents.ts` | Agent 定义 |
| skills | `api/skills.ts` | 技能查询 |
| adapters | `api/adapters.ts` | 适配器配置 |
| search | `api/search.ts` | 搜索 |
| filesystem | `api/filesystem.ts` | 文件系统 |
