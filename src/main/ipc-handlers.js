/**
 * ipc-handlers.js — src/main/ipc-handlers.js
 * Registers and handles Electron Inter-Process Communication (IPC) messages.
 * Layer: Main Process / Dependencies: electron, config, storage, database, client, tool-parser
 */
import { ipcMain, BrowserWindow } from 'electron'
import { config } from './config.js'
import { storage } from './storage.js'
import { database } from './database.js'
import { streamChat } from './llm/client.js'
import { buildSystemPrompt } from './system-prompt.js'
import { agentRegistry } from '../engine/agent-registry.js'
import { toolRegistry } from '../engine/tool-registry.js'
import { skillRegistry } from '../engine/skill-registry.js'
import { executeTool } from '../engine/python-bridge.js'
import { StreamingToolParser, formatResult, formatDisplayForActivityLog } from '../engine/tool-parser.js'

let abortController = null

/**
 * WHAT:    Retrieves the primary application window instance.
 * WHY:     Needed to send IPC events back to the renderer process.
 * HOW:     Queries BrowserWindow.getAllWindows() and returns the first index.
 * PARAMS:  none
 * RETURNS: BrowserWindow|undefined - The active main window.
 */
function getMainWindow() {
  return BrowserWindow.getAllWindows()[0]
}

function normalizeError(err) {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function formatToolExecutionError(name, args, cause, details = null) {
  const payload = {
    status: 'error',
    tool: name,
    args,
    cause,
  }
  if (details) payload.details = details
  return `TOOL_EXECUTION_ERROR\n${JSON.stringify(payload, null, 2)}`
}

function formatToolExecutionSuccess(name, output) {
  const payload = {
    status: 'ok',
    tool: name,
    output,
  }
  return `TOOL_EXECUTION_OK\n${JSON.stringify(payload, null, 2)}`
}

async function dispatchToolBlock(block) {
  const name = block?.name
  const args = block?.args || {}

  const tool = toolRegistry.get(name)
  if (tool) {
    try {
      const result = executeTool(tool.path, args)
      return {
        ok: true,
        kind: 'tool',
        name,
        args,
        resultText: formatToolExecutionSuccess(name, result),
      }
    } catch (err) {
      return {
        ok: false,
        kind: 'tool',
        name,
        args,
        resultText: formatToolExecutionError(name, args, 'Tool execution failed', normalizeError(err)),
      }
    }
  }

  if (agentRegistry.get(name)) {
    return {
      ok: false,
      kind: 'agent',
      name,
      args,
      resultText: formatToolExecutionError(
        name,
        args,
        'Agent execution is not implemented in JS runtime yet',
        'This call was recognized as an agent, but only Python tools are executable at the moment.'
      ),
    }
  }

  if (skillRegistry.get(name)) {
    return {
      ok: false,
      kind: 'skill',
      name,
      args,
      resultText: formatToolExecutionError(
        name,
        args,
        'Skill execution is not implemented in JS runtime yet',
        'This call was recognized as a skill, but only Python tools are executable at the moment.'
      ),
    }
  }

  return {
    ok: false,
    kind: 'unknown',
    name,
    args,
    resultText: formatToolExecutionError(
      name,
      args,
      'Unknown tool/agent/skill name',
      'Use exactly one name from AVAILABLE TOOLS or AVAILABLE AGENTS.'
    ),
  }
}

/**
 * WHAT:    Registers IPC channel listeners for all application settings, database sessions, and chat streams.
 * WHY:     Serves as the bridge between the Electron preload context and the main Node.js process operations.
 * HOW:     Calls ipcMain.handle and ipcMain.on for specific whitelist channels.
 * PARAMS:  none
 * RETURNS: none
 */
export function registerIpcHandlers() {
  ipcMain.handle('settings:load', () => storage.load())
  ipcMain.handle('settings:save', (_event, prefs) => storage.save(prefs))

  ipcMain.handle('config:load', () => ({
    chatModel: config.chatModel,
    visionModel: config.visionModel,
    summarizationModel: config.summarizationModel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    maxContext: config.maxContext,
    minContext: config.minContext,
    systemPrompt: config.systemPrompt,
    theme: config.theme,
  }))

  ipcMain.handle('config:save', (_event, partial) => config.saveConfig(partial))

  ipcMain.handle('providers:list', () => config.getProviderList())

  ipcMain.handle('models:list', (_event, providerAlias) => config.fetchModelsForProvider(providerAlias))

  ipcMain.handle('sessions:list', () => database.listSessions())
  ipcMain.handle('sessions:load', (_event, id) => database.getSession(id))
  ipcMain.handle('sessions:save', (_event, session) => {
    if (session.id) {
      database.updateSession(session.id, session.title, session.messages)
    } else {
      return database.createSession(session.title, session.messages)
    }
  })
  ipcMain.handle('sessions:delete', (_event, id) => database.deleteSession(id))
  ipcMain.handle('sessions:archive', (_event, id) => database.archiveSession(id))
  ipcMain.handle('sessions:dir', (_event, id) => database.sessionDir(id))

  ipcMain.handle('tools:inspect', async (_event, toolPath) => {
    const { inspectTool } = await import('../engine/python-bridge.js')
    return inspectTool(toolPath)
  })

  ipcMain.handle('tools:execute', async (_event, toolName, args) => {
    const tool = toolRegistry.get(toolName)
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`)
    }
    return executeTool(tool.path, args)
  })

  ipcMain.on('chat:send', async (_event, payload) => {
    const { messages, sessionId, settings } = payload
    const win = getMainWindow()
    if (!win) return

    abortController = new AbortController()

    const modelStr = settings?.chatModel || config.chatModel
    const modelConfig = config.resolveModel(modelStr)

    try {
      const sessionDir = sessionId ? database.sessionDir(sessionId) : null
      const knownTools = new Set([
        ...toolRegistry.list().map((t) => t.name),
        ...agentRegistry.list().map((a) => a.name),
        ...skillRegistry.list().map((s) => s.name),
      ])

      let reasoningBuffer = ''
      let finalVisibleContent = ''
      const conversation = [...messages]
      const maxRounds = 12

      for (let round = 1; round <= maxRounds; round += 1) {
        if (abortController.signal.aborted) break

        const systemMsg = buildSystemPrompt(toolRegistry.list(), agentRegistry.list(), skillRegistry.list(), sessionDir)
        const fullMessages = [systemMsg, ...conversation]
        const parser = new StreamingToolParser(knownTools)
        let roundVisibleContent = ''
        let roundRawContent = ''

        const stream = streamChat(fullMessages, {
          apiKey: modelConfig.apiKey,
          apiBase: modelConfig.apiBase,
          model: modelConfig.model,
          temperature: settings?.temperature ?? config.temperature,
          maxTokens: settings?.maxTokens ?? config.maxTokens,
          signal: abortController.signal,
        })

        for await (const event of stream) {
          if (abortController.signal.aborted) break

          if (event.type === 'content') {
            roundRawContent += event.content
            for (const parsedEvent of parser.feed(event.content)) {
              if (parsedEvent.type === 'content' && parsedEvent.content) {
                roundVisibleContent += parsedEvent.content
                win.webContents.send('chat:chunk', parsedEvent.content)
              }
            }
          }

          if (event.type === 'reasoning') {
            reasoningBuffer += event.content
            win.webContents.send('chat:reasoning', event.content)
          }
        }

        for (const parsedEvent of parser.flush()) {
          if (parsedEvent.type === 'content' && parsedEvent.content) {
            roundVisibleContent += parsedEvent.content
            win.webContents.send('chat:chunk', parsedEvent.content)
          }
        }

        finalVisibleContent = roundVisibleContent

        const assistantMsg = { role: 'assistant', content: roundRawContent }
        conversation.push(assistantMsg)

        const toolBlocks = parser.toolBlocks || []
        if (toolBlocks.length === 0) {
          break
        }

        const block = toolBlocks[0]
        const displayLine = formatDisplayForActivityLog(block.name, block.args || {}, null)
        win.webContents.send('chat:tool', [{ ...block, display: displayLine, round }])
        win.webContents.send('chat:status', { value: 'tool_run', content: `Running: ${block.name}...` })

        const dispatch = await dispatchToolBlock(block)
        const wrappedResult = formatResult(dispatch.name, dispatch.resultText)
        conversation.push({ role: 'user', content: wrappedResult })

        win.webContents.send('chat:status', {
          value: dispatch.ok ? 'tool_done' : 'tool_error',
          content: dispatch.ok ? `Done: ${dispatch.name}` : `Error: ${dispatch.name}`,
        })
      }

      if (!abortController.signal.aborted) {
        win.webContents.send('chat:usage', {
          tokens: finalVisibleContent.length / 4,
          cost: 0,
        })

        win.webContents.send('chat:done', { content: finalVisibleContent, reasoning: reasoningBuffer })
      }
    } catch (err) {
      if (!abortController?.signal.aborted) {
        win.webContents.send('chat:error', err.message || String(err))
      }
    }
  })

  ipcMain.on('chat:cancel', () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    const win = getMainWindow()
    if (win) win.webContents.send('chat:done', { content: '', reasoning: '' })
  })
}
