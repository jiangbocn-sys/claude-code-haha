# Claude Code 桌面端 — 架构设计

> 从 Tauri 窗口到 CLI 子进程，深入理解桌面端的三层通信架构。

<p align="center">
<a href="#一技术栈全景">技术栈</a> · <a href="#二三层架构">三层架构</a> · <a href="#三websocket-通信协议">WebSocket 协议</a> · <a href="#四http-api-端点">HTTP API</a> · <a href="#五状态管理">状态管理</a> · <a href="#六会话生命周期">会话生命周期</a> · <a href="#七代理层协议转换">协议转换</a> · <a href="#八适配器桥接架构">适配器架构</a>
</p>

![技术栈全景](./images/02-tech-stack.png)

---

## 一、技术栈全景

Claude Code 桌面端的技术选型强调**轻量、高性能、跨平台**：

### 前端层

| 技术 | 版本 | 职责 |
|------|------|------|
| **React** | 18.3.1 | UI 框架，函数式组件 + Hooks |
| **Zustand** | 5.0.3 | 轻量级状态管理，零样板代码 |
| **Vite** | 6.0.7 | 构建工具，HMR 热更新 |
| **Tailwind CSS** | 4.0 | 原子化样式框架 |
| **Shiki** | 4.0.2 | VS Code 级别代码语法高亮 |
| **react-diff-viewer** | 4.2.0 | Diff 变更展示 |
| **marked** | 15.0.7 | Markdown 解析渲染 |

### 桌面层

| 技术 | 版本 | 职责 |
|------|------|------|
| **Tauri** | 2.x | 跨平台桌面框架（Rust） |
| **tauri-plugin-shell** | 2.x | Sidecar 进程管理 |
| **tauri-plugin-dialog** | 2.x | 原生文件选择对话框 |
| **tauri-plugin-process** | 2.x | 进程生命周期管理 |

### 服务端层

| 技术 | 职责 |
|------|------|
| **Bun** | JavaScript/TypeScript 运行时 + 构建工具 |
| **Bun.serve** | HTTP/WebSocket 服务器 |
| **Zod** | 请求参数校验 |

### 字体系统

桌面端自托管所有字体，无需 CDN 依赖：

- **Inter** (400-600) — 正文
- **Manrope** (400-800) — 标题
- **JetBrains Mono** — 代码
- **Material Symbols Outlined** — 图标

---

## 二、三层架构

![三层架构图](./images/03-three-layer-arch.png)

桌面端采用**三层架构**设计，各层职责明确：

```
┌─────────────────────────────────┐
│         Tauri 主进程 (Rust)       │
│  ┌───────────────────────────┐  │
│  │   WebView (React App)     │  │  ← 用户看到的界面
│  │   Port 1420 (开发) / 内置  │  │
│  └───────────┬───────────────┘  │
│              │ HTTP + WebSocket  │
│  ┌───────────▼───────────────┐  │
│  │   Sidecar: claude-server  │  │  ← Bun 编译的服务端二进制
│  │   Port: 动态分配           │  │
│  └───────────┬───────────────┘  │
│              │ 子进程 spawn      │
│  ┌───────────▼───────────────┐  │
│  │   CLI 子进程 (claude-cli)  │  │  ← 实际执行 AI 对话和工具调用
│  │   stdin/stdout 通信        │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 第一层：Tauri 主进程

**职责**：窗口管理、进程编排、原生 API 桥接

关键文件：`desktop/src-tauri/src/lib.rs`

```rust
// 核心功能
fn reserve_local_port() -> u16    // 获取空闲端口
fn wait_for_server(port) -> bool  // 等待服务就绪（超时 10 秒）
fn start_server_sidecar(port)     // 启动 Server 后台进程
fn stop_server_sidecar()          // 停止 Server 后台进程

// Tauri 命令（暴露给前端调用）
#[tauri::command]
fn get_server_url() -> String     // 返回 http://127.0.0.1:{port}
```

启动流程：
1. Tauri 主进程启动
2. 调用 `reserve_local_port()` 获取空闲端口
3. 启动 `claude-server` sidecar 进程，传入端口号
4. 调用 `wait_for_server()` 轮询等待服务就绪
5. WebView 加载 React 应用
6. 前端调用 `get_server_url` 获取服务地址

### 第二层：Server Sidecar

**职责**：HTTP API + WebSocket 网关 + 会话管理 + 代理转换

关键文件：`src/server/index.ts`

```typescript
// 服务器启动
Bun.serve({
  port: config.port,
  fetch(req, server) {
    // HTTP 路由 + WebSocket 升级
    if (url.pathname.startsWith('/ws/')) {
      server.upgrade(req, { data: { sessionId } })
      return
    }
    return router.handle(req)
  },
  websocket: {
    open(ws) { /* 连接建立 */ },
    message(ws, msg) { /* 消息处理 */ },
    close(ws) { /* 连接关闭 */ }
  }
})
```

Server 提供两类服务：
- **HTTP REST API** — 会话管理、配置读写、模型操作
- **WebSocket** — 实时消息通道（对话流、权限请求、状态推送）

### 第三层：CLI 子进程

**职责**：AI 对话核心逻辑、工具执行、Agent 编排

Server 为每个 Session 创建一个 CLI 子进程：

```typescript
// 创建 CLI 子进程
const child = spawn('claude-cli', ['--session', sessionId], {
  cwd: workDir,
  env: { ...process.env, ANTHROPIC_AUTH_TOKEN: token }
})

// 通过 stdin/stdout 通信
child.stdin.write(JSON.stringify({ type: 'user_message', content }))
child.stdout.on('data', (chunk) => {
  // 解析 stream_event，转发给 WebSocket 客户端
})
```

### Sidecar 构建

使用 Bun 将 TypeScript 编译为独立可执行文件：

```typescript
// desktop/scripts/build-sidecars.ts
// 支持 8 种目标平台：
const targets = [
  'bun-darwin-arm64',      // M1/M2 Mac
  'bun-darwin-x64',        // Intel Mac
  'bun-windows-x64',       // Windows x64
  'bun-windows-arm64',     // Windows ARM
  'bun-linux-x64',         // Linux x64
  'bun-linux-arm64',       // Linux ARM
  'bun-linux-x64-musl',    // Alpine Linux
  'bun-linux-arm64-musl',  // Alpine ARM
]
```

编译产物放置在 `desktop/src-tauri/binaries/`，Tauri 打包时自动包含。

---

## 三、WebSocket 通信协议

![WebSocket 通信协议](./images/04-websocket-protocol.png)

WebSocket 是桌面端与服务端实时通信的核心通道。

### 连接建立

```
ws://127.0.0.1:{port}/ws/{sessionId}
```

前端通过 `wsManager`（单例）管理所有 WebSocket 连接：

```typescript
// desktop/src/api/websocket.ts
class WebSocketManager {
  private connections = new Map<string, WebSocket>()
  
  connect(sessionId: string): void {
    const ws = new WebSocket(`${baseUrl}/ws/${sessionId}`)
    // 自动重连（指数退避）
    // 消息队列（连接未就绪时缓冲）
    // 心跳 ping（30 秒间隔）
  }
}
```

### 客户端 → 服务端消息

| type | 字段 | 说明 |
|------|------|------|
| `user_message` | `content`, `attachments?` | 用户发送消息 |
| `permission_response` | `requestId`, `allowed`, `rule?` | 权限审批响应 |
| `set_permission_mode` | `mode` | 切换权限模式 |
| `stop_generation` | — | 停止当前生成 |
| `ping` | — | 心跳保活 |

### 服务端 → 客户端消息

| type | 关键字段 | 说明 |
|------|----------|------|
| `connected` | `sessionId` | 连接成功确认 |
| `status` | `state`, `verb?`, `elapsed?` | 状态变更（thinking/generating） |
| `content_start` | `blockType` | 内容块开始（text/tool_use） |
| `content_delta` | `text?`, `toolInput?` | 增量内容（流式文本） |
| `thinking` | `text` | Extended Thinking 内容 |
| `tool_use_complete` | `toolName`, `input` | 工具调用准备就绪 |
| `tool_result` | `output`, `isError` | 工具执行结果 |
| `permission_request` | `toolName`, `input`, `requestId` | 权限请求 |
| `message_complete` | `usage: TokenUsage` | 消息完成（含 Token 统计） |
| `error` | `message`, `code` | 错误通知 |
| `session_title_updated` | `title` | 会话标题更新 |
| `team_update` | `team` | 团队状态变更 |
| `team_created` / `team_deleted` | `teamName` | 团队创建/删除 |
| `task_update` | `task` | 任务状态变更 |
| `pong` | — | 心跳响应 |

### 完整消息流示例

一条用户消息从发送到收到完整回复的流程：

```
用户输入 "写一个排序函数"
    ↓
ChatInput → chatStore.sendMessage()
    ↓
wsManager.send({ type: 'user_message', content: '...' })
    ↓
Server 收到 → 转发到 CLI 子进程
    ↓
CLI 开始处理，流式返回事件：

← { type: 'status', state: 'thinking' }
   → UI 显示"思考中..."动画

← { type: 'thinking', text: '让我分析...' }
   → ThinkingBlock 展示推理过程

← { type: 'content_start', blockType: 'text' }
   → 准备接收文本内容

← { type: 'content_delta', text: 'def sort(' }
← { type: 'content_delta', text: 'arr):\n' }
← { type: 'content_delta', text: '  return sorted(arr)' }
   → AssistantMessage 流式渲染，闪烁光标

← { type: 'content_start', blockType: 'tool_use' }
   → 准备接收工具调用

← { type: 'tool_use_complete', toolName: 'Write', input: {...} }
   → ToolCallBlock 展示文件写入操作

← { type: 'permission_request', toolName: 'Write', requestId: '...' }
   → PermissionDialog 弹出，等待用户审批

用户点击"允许"
    ↓
→ { type: 'permission_response', requestId: '...', allowed: true }

← { type: 'tool_result', output: '文件已写入' }
   → ToolResultBlock 展示结果

← { type: 'message_complete', usage: { input: 1200, output: 350 } }
   → 更新 Token 统计，清除流式状态
```

### 连接管理

**心跳保活**：每 30 秒发送 `ping`，服务端回复 `pong`

**自动重连**：指数退避策略

```
重连间隔 = min(1000ms × 2^(attempt-1), 30000ms)
最大重连次数 = 10
```

**消息缓冲**：WebSocket 未就绪时，消息暂存队列，连接恢复后自动发送。

---

## 四、HTTP API 端点

Server 提供完整的 RESTful API，供前端和适配器调用。

### 会话管理

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/sessions` | 获取会话列表 |
| `POST` | `/api/sessions` | 创建新会话 |
| `GET` | `/api/sessions/:id` | 获取会话详情 |
| `PATCH` | `/api/sessions/:id` | 重命名会话 |
| `DELETE` | `/api/sessions/:id` | 删除会话 |
| `GET` | `/api/sessions/:id/messages` | 获取历史消息 |
| `GET` | `/api/sessions/:id/git-info` | 获取 Git 信息 |
| `GET` | `/api/sessions/:id/slash-commands` | 获取可用斜杠命令 |
| `GET` | `/api/sessions/recent-projects` | 最近项目列表 |

### 模型与提供商

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/models` | 可用模型列表 |
| `GET` | `/api/models/current` | 当前使用的模型 |
| `POST` | `/api/models/:id/set-current` | 切换模型 |
| `GET/POST` | `/api/models/effort` | 获取/设置 Effort 级别 |
| `GET` | `/api/providers` | 提供商列表 |
| `POST` | `/api/providers` | 创建提供商 |
| `PUT` | `/api/providers/:id` | 更新提供商配置 |
| `DELETE` | `/api/providers/:id` | 删除提供商 |
| `POST` | `/api/providers/:id/activate` | 激活提供商 |
| `POST` | `/api/providers/:id/test` | 测试连接 |
| `GET` | `/api/providers/presets` | 获取预设列表 |

### 定时任务

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/scheduled-tasks` | 任务列表 |
| `POST` | `/api/scheduled-tasks` | 创建任务 |
| `PUT` | `/api/scheduled-tasks/:id` | 更新任务 |
| `DELETE` | `/api/scheduled-tasks/:id` | 删除任务 |
| `POST` | `/api/scheduled-tasks/:id/run` | 手动运行 |
| `GET` | `/api/scheduled-tasks/runs` | 所有运行记录 |
| `GET` | `/api/scheduled-tasks/:id/runs` | 单任务运行记录 |

### Agent 团队

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/teams` | 团队列表 |
| `GET` | `/api/teams/:name` | 团队详情 |
| `GET` | `/api/teams/:name/members/:agentId/transcript` | 成员转录 |
| `DELETE` | `/api/teams/:name` | 删除团队 |

### 其他

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET/POST` | `/api/settings/permission-mode` | 权限模式 |
| `GET` | `/api/agents` | Agent 定义列表 |
| `GET` | `/api/skills` | 技能列表 |
| `GET` | `/api/skills/detail` | 技能详情 |
| `GET/PUT` | `/api/adapters` | 适配器配置 |

---

## 五、状态管理

![会话生命周期](./images/05-session-lifecycle.png)

桌面端使用 **Zustand** 进行状态管理，按领域拆分为多个独立 Store。

### Store 架构

```
stores/
├── chatStore.ts          # 聊天状态（消息、流式、权限）  20KB
├── sessionStore.ts       # 会话列表、创建、删除
├── tabStore.ts           # 标签页管理、顺序、持久化    5KB
├── settingsStore.ts      # 全局设置（模型、权限、语言）
├── providerStore.ts      # LLM 提供商配置
├── uiStore.ts            # UI 状态（主题、Toast、模态框）
├── taskStore.ts          # 定时任务管理
├── teamStore.ts          # Agent 团队状态
├── agentStore.ts         # Agent 定义管理
├── skillStore.ts         # 技能库
├── adapterStore.ts       # 适配器配置
└── cliTaskStore.ts       # CLI 任务状态
```

### chatStore 核心设计

`chatStore` 是最复杂的 Store，为**每个 Session 维护独立状态**：

```typescript
type PerSessionState = {
  messages: UIMessage[]                     // 消息列表
  chatState: 'idle' | 'thinking' | ...     // 对话状态
  connectionState: ConnectionState         // WebSocket 连接状态
  streamingText: string                    // 流式文本缓冲
  streamingToolInput: string               // 工具输入流
  activeToolUseId: string | null           // 当前工具调用 ID
  activeToolName: string | null            // 当前工具名称
  activeThinkingId: string | null          // 当前思考块 ID
  pendingPermission: PermissionRequest | null  // 待决权限
  tokenUsage: TokenUsage                   // Token 使用统计
  elapsedSeconds: number                   // 经过时间
  statusVerb: string                       // 随机状态动词
  slashCommands: SlashCommand[]            // 可用命令列表
}
```

关键方法：

| 方法 | 职责 |
|------|------|
| `connectToSession(id)` | 建立 WebSocket 连接 |
| `disconnectSession(id)` | 断开连接 |
| `sendMessage(id, content, attachments)` | 发送用户消息 |
| `respondToPermission(id, requestId, allowed, rule)` | 权限审批 |
| `stopGeneration(id)` | 停止生成 |
| `loadHistory(id)` | 加载历史消息 |
| `handleServerMessage(id, msg)` | 处理服务端消息 |

### 数据流向

```
用户操作
  ↓
Component (调用 Store 方法)
  ↓
Store (更新状态 + 调用 API/WebSocket)
  ↓
API 层 (HTTP 请求 / WebSocket 发送)
  ↓
Server 响应
  ↓
Store (更新状态)
  ↓
Component (自动重渲染)
```

### 持久化策略

| 数据 | 存储位置 | 说明 |
|------|----------|------|
| 打开的标签页 | `localStorage` | 页面刷新/重启后恢复 |
| 会话数据 | Server JSONL 文件 | `~/.claude/sessions/` |
| 设置 | Server API | 通过 HTTP 读写 |
| 适配器配置 | `~/.claude/adapters.json` | JSON 文件 |
| 会话映射 | `~/.claude/adapter-sessions.json` | 适配器 Chat→Session 映射 |

---

## 六、会话生命周期

一个会话从创建到恢复的完整流程：

### 创建

```
用户点击 + 新建会话
  ↓
sessionStore.createSession({ workDir })
  ↓
POST /api/sessions { workDir: '/path/to/project' }
  ↓
Server 创建 Session 记录 → 返回 { sessionId }
  ↓
tabStore.openTab(sessionId)
  ↓
chatStore.connectToSession(sessionId)
  ↓
WebSocket 连接 → 收到 { type: 'connected' }
```

### 交互

```
用户发送消息
  ↓
wsManager.send({ type: 'user_message', content })
  ↓
Server 转发到 CLI 子进程
  ↓
CLI 处理 → 流式返回 stream_event
  ↓
Server 转换为 ServerMessage → 推送到 WebSocket
  ↓
chatStore.handleServerMessage() → UI 更新
```

### 断开

```
用户关闭标签页 / 切换到其他标签
  ↓
chatStore.disconnectSession(sessionId)
  ↓
WebSocket 关闭
  ↓
CLI 子进程可能继续运行（后台任务）
```

### 恢复

```
应用启动 / 切回标签页
  ↓
tabStore.restoreTabs()  // 从 localStorage 读取
  ↓
验证会话是否仍存在 (GET /api/sessions)
  ↓
chatStore.connectToSession(sessionId)
  ↓
chatStore.loadHistory(sessionId)  // GET /api/sessions/:id/messages
  ↓
WebSocket 重连 → 恢复实时通信
```

### 会话持久化

Server 使用 **JSONL（JSON Lines）** 格式持久化会话数据：

```
~/.claude/sessions/
├── {sessionId}/
│   ├── messages.jsonl    ← 流式追加，每行一条消息/事件
│   ├── metadata.json     ← 会话元数据（workDir、标题、模型等）
│   └── ...
```

JSONL 格式的优势：
- **流式追加**：新消息直接 append，无需重写整个文件
- **崩溃恢复**：即使中途崩溃，已写入的行不会丢失
- **大会话支持**：按行读取，无需一次性加载整个 JSON

---

## 七、代理层协议转换

Server 内置了多协议代理层（Proxy），让不同 AI 提供商的 API 统一接入。

### 支持的 API 格式

| 格式 | 说明 | 典型提供商 |
|------|------|-----------|
| `anthropic` | Anthropic Messages API | Anthropic 官方、MiniMax |
| `openai_chat` | OpenAI Chat Completions | OpenAI、DeepSeek |
| `openai_responses` | OpenAI Responses API | OpenAI 新接口 |

### 协议转换流程

```
前端发送消息
  ↓
Server 接收
  ↓
判断当前 Provider 的 API 格式
  ↓
┌─────────────────────────────────┐
│  anthropic  │ openai_chat/resp  │
│  直接透传    │ 转换消息格式       │
│             │ system → 系统消息   │
│             │ tool_use → 函数调用 │
│             │ tool_result → 函数结果│
└──────┬──────┴──────┬────────────┘
       │             │
       ↓             ↓
   Anthropic API   OpenAI API
       │             │
       ↓             ↓
   直接返回       反向转换响应格式
       │             │
       └──────┬──────┘
              ↓
         统一的 ServerMessage 格式
              ↓
         WebSocket 推送给前端
```

### 模型映射

每个 Provider 可配置四个模型槽位：

| 槽位 | 用途 |
|------|------|
| `main` | 主对话模型 |
| `haiku` | 快速/轻量任务 |
| `sonnet` | 中等复杂度 |
| `opus` | 最高能力 |

例如 OpenRouter 配置：

```json
{
  "apiFormat": "anthropic",
  "baseUrl": "https://openrouter.ai/api/v1",
  "modelMapping": {
    "main": "anthropic/claude-sonnet-4-20250514",
    "haiku": "anthropic/claude-haiku-4-5-20251001",
    "opus": "anthropic/claude-opus-4-20250514"
  }
}
```

---

## 八、适配器桥接架构

![适配器桥接架构](./images/07-adapter-bridge.png)

适配器系统让**任何 IM 平台**都可以接入 Claude Code，无需修改核心代码。

### 整体架构

```
┌──────────────┐    ┌──────────────┐
│   Telegram   │    │    飞书       │    ← IM 平台
│   grammy     │    │   Lark SDK   │
└──────┬───────┘    └──────┬───────┘
       │                   │
       ▼                   ▼
┌──────────────────────────────────┐
│       Adapter 进程               │    ← 平台适配层
│  ┌─────────────────────────────┐ │
│  │       common/ 共享模块       │ │
│  │  config   │  ws-bridge      │ │
│  │  pairing  │  message-buffer │ │
│  │  dedup    │  chat-queue     │ │
│  │  session  │  http-client    │ │
│  └─────────────────────────────┘ │
└──────────────┬───────────────────┘
               │ HTTP + WebSocket
               ▼
┌──────────────────────────────────┐
│       Desktop Server             │    ← 服务端
│  POST /api/sessions              │
│  WS   /ws/{sessionId}           │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│       CLI 子进程                  │    ← AI 对话引擎
└──────────────────────────────────┘
```

### 四层架构

| 层级 | 职责 | 关键文件 |
|------|------|----------|
| **配置层** | 桌面端 UI 填写凭证 | `desktop/src/pages/AdapterSettings.tsx` |
| **存储层** | 配置读写和脱敏 | `src/server/services/adapterService.ts` |
| **适配层** | IM SDK 对接、消息路由 | `adapters/telegram/index.ts`, `adapters/feishu/index.ts` |
| **会话层** | WebSocket 桥接到 Server | `adapters/common/ws-bridge.ts` |

### 共享模块

所有适配器共用 `adapters/common/` 模块：

| 模块 | 职责 |
|------|------|
| `config.ts` | 配置加载（环境变量 > JSON 文件 > 默认值） |
| `ws-bridge.ts` | WebSocket 连接管理（心跳、重连、消息路由） |
| `pairing.ts` | 用户配对（6 位安全码、速率限制） |
| `session-store.ts` | Chat→Session 映射持久化 |
| `message-buffer.ts` | 流式消息缓冲（500ms/200 字符阈值刷新） |
| `message-dedup.ts` | 消息去重（防重连重复） |
| `chat-queue.ts` | 同一 Chat 消息串行队列 |
| `http-client.ts` | HTTP 客户端（创建会话、获取项目列表） |

### 接入新 IM 平台

得益于模块化设计，接入新平台只需三步：

**1. 创建适配器文件**

```typescript
// adapters/discord/index.ts
import { WsBridge } from '../common/ws-bridge.js'
import { MessageBuffer } from '../common/message-buffer.js'
import { loadConfig } from '../common/config.js'
import { isPaired, tryPair } from '../common/pairing.js'
```

**2. 实现消息接收**

```typescript
bot.on('message', async (msg) => {
  // 去重 → 授权检查 → 会话管理 → WebSocket 桥接
  if (!dedup.tryRecord(msg.id)) return
  if (!isPaired('discord', msg.author.id, config)) {
    tryPair(msg.content, { userId: msg.author.id, ... }, 'discord')
    return
  }
  bridge.sendUserMessage(chatId, msg.content)
})
```

**3. 处理服务端事件**

```typescript
bridge.onServerMessage(chatId, async (msg) => {
  switch (msg.type) {
    case 'content_delta': /* 流式文本 */ break
    case 'permission_request': /* 权限按钮 */ break
    case 'message_complete': /* 完成 */ break
  }
})
```

### 消息缓冲机制

为防止 IM 平台的消息频率限制，适配器使用 `MessageBuffer` 批量刷新：

```
content_delta: "def "    ─┐
content_delta: "sort("   │→ 缓冲累积
content_delta: "arr):"   │
                         ↓ 500ms 或 200 字符
                    IM 平台: "def sort(arr): ▍"  (编辑消息)
                         
content_delta: "\n  ..."  ─┐
content_delta: "return"   │→ 继续缓冲
                          ↓
                    IM 平台: "def sort(arr):\n  return ▍"

message_complete          ↓
                    IM 平台: 最终完整文本（分片发送）
```

分片限制：
- Telegram: 4000 字符/消息
- 飞书: 30000 字符/消息

---

## 九、项目目录结构

```
desktop/
├── src/                           # React 前端
│   ├── App.tsx                   # 根组件
│   ├── main.tsx                  # 入口
│   ├── components/
│   │   ├── layout/               # 布局：AppShell, Sidebar, TabBar
│   │   ├── chat/                 # 聊天：MessageList, ChatInput, ToolCallBlock
│   │   ├── shared/               # 通用：Button, Modal, Toast, Spinner
│   │   ├── controls/             # 控件：ModelSelector, PermissionModeSelector
│   │   ├── markdown/             # MarkdownRenderer
│   │   ├── skills/               # 技能浏览
│   │   ├── tasks/                # 任务管理
│   │   └── teams/                # 团队视图
│   ├── pages/                    # 页面：ActiveSession, Settings, ScheduledTasks
│   ├── stores/                   # Zustand 状态
│   ├── api/                      # HTTP + WebSocket 客户端
│   ├── types/                    # TypeScript 类型定义
│   ├── hooks/                    # 自定义 Hooks
│   ├── i18n/                     # 国际化
│   ├── theme/                    # 全局样式
│   ├── config/                   # 提供商预设
│   └── lib/                      # 工具库
├── src-tauri/                     # Tauri Rust 后端
│   ├── src/lib.rs                # 核心：端口管理、Sidecar 启动
│   ├── Cargo.toml                # Rust 依赖
│   └── tauri.conf.json           # Tauri 配置
├── sidecars/                      # Sidecar 启动器
│   └── claude-sidecar.ts         # server/cli/adapters 三种模式
├── scripts/
│   └── build-sidecars.ts         # 跨平台编译脚本
├── vite.config.ts                # Vite 构建配置
├── package.json                  # 依赖和脚本
└── tsconfig.json                 # TypeScript 配置

src/server/                        # 服务端（独立于 desktop/）
├── index.ts                      # 入口：Bun.serve
├── router.ts                     # HTTP 路由
├── ws/                           # WebSocket 处理
├── api/                          # REST API 路由
├── services/                     # 业务服务
├── proxy/                        # 代理层（协议转换）
├── middleware/                   # 中间件
├── config/                       # 服务端配置
└── types/                        # 类型定义

adapters/                          # 外部 IM 适配器
├── common/                       # 共享模块（9 个文件）
├── telegram/index.ts             # Telegram Bot
├── feishu/index.ts               # 飞书 Bot
└── package.json                  # 独立依赖
```

---

## 十、快速参考

### 关键端口

| 端口 | 用途 |
|------|------|
| 1420 | Vite 开发服务器 |
| 动态分配 | Server Sidecar（`reserve_local_port`） |

### 关键文件路径

| 文件 | 说明 |
|------|------|
| `~/.claude/adapters.json` | 适配器配置 |
| `~/.claude/adapter-sessions.json` | 适配器会话映射 |
| `~/.claude/sessions/` | 会话持久化数据 |

### 开发命令

```bash
# 前端开发
cd desktop && bun run dev

# 编译 Sidecar
cd desktop && bun run build:sidecars

# Tauri 开发模式（前端 + 桌面框架）
cd desktop && bunx tauri dev

# 构建发布包
cd desktop && bunx tauri build

# 运行测试
cd desktop && bun run test
```
