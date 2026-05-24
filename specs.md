# Simplex JS — Specifications

Simplex AI — Electron + React desktop application. Migrated from Python (NiceGUI + PySide6 + LiteLLM).

## Architecture

| Layer | Tech |
|---|---|
| Desktop shell | Electron 38 |
| UI framework | React 19 |
| Build tool | Vite 7 + electron-builder |
| Language | JavaScript (ESM) |
| Database | better-sqlite3 |
| LLM client | OpenAI-compatible streaming API |
| Tool execution | Python subprocess bridge |

## Project Structure

```
src/
  main/           — Electron main process
    index.js        App lifecycle, CSP, security
    ipc-handlers.js IPC channel registration
    config.js       .env parser, multi-provider resolution, config.json persistence
    database.js     SQLite session CRUD + folder management
    storage.js      JSON user settings persistence
    system-prompt.js Dynamic system prompt builder
    prompts.js      Prompt templates
    llm/
      client.js     OpenAI-compatible streaming chat with retry
      token-counter.js Token estimation
  engine/         — Chat/agent/tool engine
    chat.js           Chat orchestration stub
    tool-parser.js    Streaming XML tool call parser
    tool-registry.js  Python tool discovery
    agent-registry.js Agent discovery
    agent-runner.js   Agent execution with tool loop
    skill-registry.js Skill loading
    python-bridge.js  Python subprocess bridge
    context.js        Context window management
    learning.js       Learning/memory stub
  preload/        — Preload scripts
    index.cjs         IPC channel whitelist (CJS for Electron compat)
  renderer/       — React UI
    main.jsx          React 18 root
    App.jsx           Layout: ChatView + Sidebar + Settings + StatusBar
    components/
      ChatView.jsx      Message list with streaming
      ChatBubble.jsx    Message bubble with markdown
      MarkdownRenderer.jsx Markdown rendering
      ReasoningBlock.jsx Collapsible reasoning
      ToolCallCard.jsx   Tool call display
      Sidebar.jsx        Session list with search/rename/archive
      Settings.jsx       Tabbed settings modal
      StatusBar.jsx      Token count, cost, status
      ModelSelector.jsx  Provider + model combo box
    hooks/
      useChat.js         Chat state, streaming, abort, auto-save
      useSessions.js     Session CRUD via IPC
      useSettings.js     Settings + model list persistence
    lib/
      ipc.js             IPC event listener manager
    styles/
      index.css          Dark theme CSS
public/
  bridge.py         Python bridge server stub
  tools/            Python tool stubs
tools/
  inspect_tools.py  Tool inspection utility
```

## Features

### 1. Multi-Provider LLM Support

- Reads providers from `.env` file (parent directory `../Simplex/.env`)
- Each provider resolved by alias: `apiBase`, `apiKey`, optional `modelsUrl`
- Default providers: `opencode-go`, `google`, `openrouter`
- Fetches available models from each provider's `/v1/models` endpoint
- Three independent model slots: **chat**, **vision**, **summarization**
- Model selection stored as `provider/modelName` string
- Resolves credentials at chat time from provider config
- Falls back to env defaults if no user config set

### 2. Settings & Configuration

**Persistence:** `~/.simplexai/config.json` (JSON merge on save)

**Models Tab:**
- Provider dropdown per model slot (chat/vision/summarization)
- Selecting a provider triggers live fetch of that provider's models
- Combo box input with type-to-filter model list
- Custom dark-themed dropdown (up to 50 visible items, type to refine beyond)
- Active model highlighted in accent color

**General Tab:**
- Temperature (0–2, step 0.1, default 0.7)
- Max Tokens (1–128000, default 4096)
- Max Context (1000–200000, default 80000)
- Min Context (500–20000, default 4000)
- Custom system prompt (textarea)
- Show reasoning/thinking toggle

**Modal Behavior:**
- Tabbed interface (Models / General)
- Closes on overlay click (not on child element clicks)
- Cancel discards changes, Save persists to disk

### 3. Session Management

**Storage:** `~/.simplexai/simplex.db` (better-sqlite3, WAL mode)

**Session Folders:** `~/.simplexai/sessions/<uuid>/` — created on session creation, removed on deletion

**Operations:**
- Create new session (auto-created on first message)
- Load session with messages
- Save/update session messages
- Delete session (removes DB row + folder)
- Archive session (soft-delete, hidden from list)
- Rename session (inline edit in sidebar)
- List sessions ordered by `updated_at DESC`

**Auto-Save:**
- Session created automatically on first user message
- Messages saved after each `chat:done` event
- Uses `sessionId` parameter to avoid React state race conditions

**Session Lifecycle:**
- Deleting current session auto-selects next available session
- Deleting last session clears chat window
- Switching sessions loads messages from database

### 4. Chat

**Streaming:**
- OpenAI-compatible SSE streaming via `streamChat()`
- Real-time content chunks rendered in chat view
- Blinking cursor indicator during streaming
- Abort support via `AbortController`

**Reasoning:**
- Separate reasoning stream alongside content
- Collapsible reasoning block in UI
- Toggle via settings

**Tool Calls:**
- Streaming XML tool call parser
- Tool call cards in message stream
- Tool execution via Python bridge (stub)

**Auto-Save:**
- Messages persisted to session after response completes
- Title auto-generated from first user message (first 50 chars)

### 5. UI Components

**ChatView:**
- Scrollable message list
- User/assistant message bubbles
- Streaming indicator (cursor blink)
- Textarea input with auto-resize (min 44px, max 200px)
- Send button, abort button during streaming

**ChatBubble:**
- Role labels (USER / ASSISTANT)
- Markdown rendering for assistant messages
- Code blocks with monospace font
- Tool call cards embedded in messages

**Sidebar:**
- Session list with scroll
- Active session highlighted with accent border
- Session actions on hover: rename (pencil), delete (trash)
- New session button (+)
- Settings button (gear icon)
- Search/filter sessions (stub)

**StatusBar:**
- Token count display
- Cost estimate
- Connection/status indicator

**Settings Modal:**
- 600px wide, 80vh max height
- Tab navigation (Models / General)
- Form inputs with dark theme styling
- Save/Cancel footer

### 6. Engine (Stubs)

**Tool Parser:**
- Streaming XML parser for tool calls
- Extracts tool name, arguments, and content

**Tool Registry:**
- Python tool discovery from `tools/` directory
- Tool schema extraction via `inspect_tools.py`

**Agent Registry:**
- Agent discovery and schema building
- Agent runner with tool execution loop

**Skill Registry:**
- Skill loading and activation

**Python Bridge:**
- Subprocess communication with Python tools
- Tool inspection and execution

**Context Manager:**
- Context window size management
- Message truncation when exceeding limits

**Learning System:**
- Memory and preferences storage (stub)

### 7. Security

- Content Security Policy enforced
- Node integration disabled
- Context isolation enabled
- IPC channel whitelist in preload script
- `ELECTRON_DISABLE_SECURITY_WARNINGS` set in dev mode

### 8. Build & Distribution

**Development:**
- `npm run dev` — Vite dev server + Electron with hot reload
- DevTools: `Ctrl+Shift+I` or `F12`

**Production:**
- `npm run build` — Vite production build
- `npm run preview` — Preview built app
- `npm run dist` — electron-builder packaging (Linux/Windows/macOS)

**Config Files:**
- `vite.config.js` — Vite + Electron plugins
- `electron-builder.yml` — Release packaging
- `.gitignore` — Dependencies, builds, env files, IDE, OS files

### 9. Python Runtime Strategy (Decided)

- Tool execution remains **Python-only**; no JS command execution tools are planned.
- The app must not depend on a user-installed system Python.
- Distribution direction: bundle a Python runtime with the installer/package and use it as the only runtime for `bridge.py` and Python tools.
- No autonomous install agent flow is used for provisioning Python.
- If Python runtime/bootstrap is not ready, app should report clear runtime status and block tool execution until runtime is healthy.

**Scope decisions:**
- Do not add JS-native `bash` / `system_install` fallback tools.
- Do not run LLM-driven OS package installation flows.
- Keep tool discovery/execution path via Python bridge only.

## IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `sessions:list` | invoke | Get all sessions |
| `sessions:load` | invoke | Load session by ID |
| `sessions:save` | invoke | Create or update session |
| `sessions:delete` | invoke | Delete session + folder |
| `sessions:archive` | invoke | Archive session |
| `sessions:dir` | invoke | Get session directory path |
| `settings:load` | invoke | Load user settings |
| `settings:save` | invoke | Save user settings |
| `config:load` | invoke | Load app config |
| `config:save` | invoke | Save partial config |
| `providers:list` | invoke | Get provider aliases |
| `models:list` | invoke | Fetch models for provider |
| `chat:send` | send | Start chat streaming |
| `chat:cancel` | send | Abort streaming |
| `chat:chunk` | on | Receive content chunk |
| `chat:reasoning` | on | Receive reasoning chunk |
| `chat:tool` | on | Receive tool call results |
| `chat:status` | on | Status updates |
| `chat:usage` | on | Token/cost info |
| `chat:done` | on | Streaming complete |
| `chat:error` | on | Error occurred |
| `tools:inspect` | invoke | Inspect Python tool |
| `tools:execute` | invoke | Execute Python tool |

## Known Issues / TODO

- Tool execution via Python bridge (stub — not fully implemented)
- Agent system (stub — not fully implemented)
- Skill system (stub — not fully implemented)
- Learning/memory system (stub — not fully implemented)
- Session search/filter in sidebar (UI stub)
- Token counting uses rough estimate (chars / 4)
- Cost calculation not implemented (returns 0)
- Vision and summarization model slots defined but not used in chat flow
