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
import { StreamingToolParser, extractToolBlocks, formatResult, formatDisplayForActivityLog } from '../engine/tool-parser.js'

const DEBUG = true

function debugLog(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args)
}

function debugJson(label, payload) {
  if (!DEBUG) return
  try {
    console.log(`[DEBUG] ${label}`, JSON.stringify(payload, null, 2))
  } catch {
    console.log(`[DEBUG] ${label}`, payload)
  }
}

let abortController = null
const MAX_ACTIVE_SKILLS = 3
const ACTIVE_SKILLS_BY_SESSION = new Map()

const SKILL_CONTROL_TOOLS = [
  {
    name: 'load_skill',
    description: 'Load a skill into ACTIVE SKILLS DETAILS so its full prompt stays pinned before chat history.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'Skill name from AVAILABLE SKILLS.' },
      },
      required: ['skill_name'],
    },
  },
  {
    name: 'unload_skill',
    description: 'Unload a previously loaded skill from ACTIVE SKILLS DETAILS.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'Currently active skill name.' },
      },
      required: ['skill_name'],
    },
  },
]

const LOAD_SKILL_TOOL = SKILL_CONTROL_TOOLS.find((t) => t.name === 'load_skill')
const UNLOAD_SKILL_TOOL = SKILL_CONTROL_TOOLS.find((t) => t.name === 'unload_skill')

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

function sessionKey(sessionId) {
  return sessionId || '__ephemeral__'
}

function getActiveSkills(sessionId) {
  const key = sessionKey(sessionId)
  if (!ACTIVE_SKILLS_BY_SESSION.has(key)) ACTIVE_SKILLS_BY_SESSION.set(key, [])
  return ACTIVE_SKILLS_BY_SESSION.get(key)
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

function isMissingRequiredArg(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  return false
}

function buildToolXmlExample(tool) {
  const props = tool?.parameters?.properties || {}
  const required = tool?.parameters?.required || []
  const lines = [`<${tool.name}>`]
  for (const name of required) {
    const hint = props[name]?.description ? `<!-- ${props[name].description} -->` : ''
    lines.push(`  <${name}>...</${name}>${hint ? ` ${hint}` : ''}`)
  }
  lines.push(`</${tool.name}>`)
  return lines.join('\n')
}

function buildToolSyntaxError(name, args, tool, missingRequired) {
  const payload = {
    status: 'error',
    tool: name,
    cause: 'TOOL_SYNTAX_ERROR',
    message: `Invalid tool XML arguments for '${name}'. Missing required params: ${missingRequired.join(', ')}`,
    required_params: tool?.parameters?.required || [],
    received_args: args,
    correct_xml_example: buildToolXmlExample(tool),
  }
  return `TOOL_SYNTAX_ERROR\n${JSON.stringify(payload, null, 2)}`
}

function handleSkillControlTool(name, args, sessionId) {
  const active = getActiveSkills(sessionId)
  const skillName = String(args?.skill_name || '').trim()

  if (name === 'load_skill') {
    if (!skillName) {
      return {
        ok: false,
        kind: 'skill_control',
        name,
        args,
        resultText: formatToolExecutionError(name, args, 'Missing required argument: skill_name'),
      }
    }

    const skill = skillRegistry.get(skillName)
    if (!skill || !skill.enabled) {
      return {
        ok: false,
        kind: 'skill_control',
        name,
        args,
        resultText: formatToolExecutionError(name, args, 'Skill not found or disabled', `Requested: ${skillName}`),
      }
    }

    const exists = active.find((s) => s.name === skill.name)
    if (exists) {
      return {
        ok: true,
        kind: 'skill_control',
        name,
        args,
        resultText: `SKILL_LOAD_OK\n${JSON.stringify({ loaded: skill.name, already_active: true }, null, 2)}`,
      }
    }

    if (active.length >= MAX_ACTIVE_SKILLS) {
      return {
        ok: false,
        kind: 'skill_control',
        name,
        args,
        resultText: formatToolExecutionError(
          name,
          args,
          `Active skill limit reached (${MAX_ACTIVE_SKILLS}). Unload one first.`,
          `active_skills: [${active.map((s) => s.name).join(', ')}]; next step: call unload_skill(skill_name='<one of active skills>') then retry load_skill(skill_name='${skillName}')`
        ),
      }
    }

    active.push({ ...skill, loadedAt: Date.now() })
    return {
      ok: true,
      kind: 'skill_control',
      name,
      args,
      resultText: `SKILL_LOAD_OK\n${JSON.stringify({ loaded: skill.name, active_count: active.length, max_active: MAX_ACTIVE_SKILLS }, null, 2)}`,
    }
  }

  if (name === 'unload_skill') {
    if (!skillName) {
      return {
        ok: false,
        kind: 'skill_control',
        name,
        args,
        resultText: formatToolExecutionError(name, args, 'Missing required argument: skill_name'),
      }
    }

    const before = active.length
    const next = active.filter((s) => s.name !== skillName)
    ACTIVE_SKILLS_BY_SESSION.set(sessionKey(sessionId), next)
    if (before === next.length) {
      return {
        ok: false,
        kind: 'skill_control',
        name,
        args,
        resultText: formatToolExecutionError(name, args, 'Skill is not active', `Requested: ${skillName}`),
      }
    }
    return {
      ok: true,
      kind: 'skill_control',
      name,
      args,
      resultText: `SKILL_UNLOAD_OK\n${JSON.stringify({ unloaded: skillName, active_count: next.length }, null, 2)}`,
    }
  }

  return null
}

function withAgentParams(args, sessionId) {
  const merged = { ...(args || {}) }
  return merged
}

async function dispatchToolBlock(block, sessionId) {
  const name = block?.name
  const args = withAgentParams(block?.args, sessionId)

  const skillControl = handleSkillControlTool(name, args, sessionId)
  if (skillControl) return skillControl

  const tool = toolRegistry.get(name)
  if (tool) {
    debugJson('[TOOL_EXECUTE_REQUEST]', {
      name,
      path: tool.path,
      args,
    })

    const required = tool?.parameters?.required || []
    const missingRequired = required.filter((key) => isMissingRequiredArg(args?.[key]))
    if (missingRequired.length > 0) {
      return {
        ok: false,
        kind: 'tool',
        name,
        args,
        resultText: buildToolSyntaxError(name, args, tool, missingRequired),
      }
    }

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
    try {
      const sessionFolder = sessionId ? database.sessionDir(sessionId) : ''
      const result = await agentRegistry.call(name, args, sessionFolder)
      return {
        ok: true,
        kind: 'agent',
        name,
        args,
        resultText: formatToolExecutionSuccess(name, result),
      }
    } catch (err) {
      return {
        ok: false,
        kind: 'agent',
        name,
        args,
        resultText: formatToolExecutionError(name, args, 'Agent execution failed', normalizeError(err)),
      }
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
    debugLog('chat:send start', {
      sessionId,
      model: modelConfig.model,
      messages: Array.isArray(messages) ? messages.length : 0,
    })

    try {
      const sessionDir = sessionId ? database.sessionDir(sessionId) : null

      let reasoningBuffer = ''
      let finalVisibleContent = ''
      const conversation = [...messages]
      const maxRounds = 12

      for (let round = 1; round <= maxRounds; round += 1) {
        if (abortController.signal.aborted) break
        debugLog('round start', { round, conversationMessages: conversation.length })
        const roundStartMs = Date.now()
        let firstChunkLogged = false
        let contentChars = 0
        let reasoningChars = 0

        const activeSkills = getActiveSkills(sessionId)
        const runtimeTools = [
          ...toolRegistry.list(),
          ...(LOAD_SKILL_TOOL ? [LOAD_SKILL_TOOL] : []),
          ...(activeSkills.length > 0 && UNLOAD_SKILL_TOOL ? [UNLOAD_SKILL_TOOL] : []),
        ]
        const knownTools = new Set([
          ...runtimeTools.map((t) => t.name),
          ...agentRegistry.list().map((a) => a.name),
          ...skillRegistry.list().map((s) => s.name),
        ])
        const systemMsg = buildSystemPrompt(runtimeTools, agentRegistry.list(), skillRegistry.list(), sessionDir, activeSkills)
        const fullMessages = [systemMsg, ...conversation]
        if (DEBUG) {
          const llmRequestPayload = {
            model: modelConfig.model,
            temperature: settings?.temperature ?? config.temperature,
            maxTokens: settings?.maxTokens ?? config.maxTokens,
            messages: fullMessages,
          }
          console.log('[DEBUG][LLM_REQUEST_JSON_PRETTY]')
          console.log(JSON.stringify(llmRequestPayload, null, 2))
          console.log('[DEBUG][LLM_REQUEST_HUMAN]')
          console.log(`model: ${llmRequestPayload.model}`)
          console.log(`temperature: ${llmRequestPayload.temperature}`)
          console.log(`maxTokens: ${llmRequestPayload.maxTokens}`)
          llmRequestPayload.messages.forEach((msg, idx) => {
            console.log(`--- message[${idx}] role=${msg.role} ---`)
            console.log(msg.content || '')
            console.log(`--- end message[${idx}] ---`)
          })
        }
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

          if (!firstChunkLogged && (event.type === 'content' || event.type === 'reasoning')) {
            firstChunkLogged = true
            debugLog('stream first chunk', {
              round,
              type: event.type,
              ttfbMs: Date.now() - roundStartMs,
            })
          }

          if (event.type === 'content') {
            contentChars += event.content?.length || 0
            roundRawContent += event.content
            for (const parsedEvent of parser.feed(event.content)) {
              if (parsedEvent.type === 'content' && parsedEvent.content) {
                roundVisibleContent += parsedEvent.content
                win.webContents.send('chat:chunk', parsedEvent.content)
              }
            }
          }

          if (event.type === 'reasoning') {
            reasoningChars += event.content?.length || 0
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
        debugLog('round stream complete', {
          round,
          durationMs: Date.now() - roundStartMs,
          rawLength: roundRawContent.length,
          visibleLength: roundVisibleContent.length,
          contentChars,
          reasoningChars,
        })

        if (!roundRawContent.trim()) {
          debugLog('empty llm response', { round, sessionId })
        }
        debugLog(`[RAW_FULL][round=${round}] >>>${roundRawContent}<<<`)

        const assistantMsg = { role: 'assistant', content: roundRawContent }
        conversation.push(assistantMsg)

        let toolBlocks = parser.toolBlocks || []
        debugJson(`[PARSER_TOOL_BLOCKS][round=${round}]`, toolBlocks)
        if (toolBlocks.length === 0 && roundRawContent) {
          const fallback = extractToolBlocks(roundRawContent, knownTools)
          if (fallback.length > 0) {
            toolBlocks = fallback
            debugJson(`[FALLBACK_TOOL_BLOCKS][round=${round}]`, fallback)
            console.warn('[tool-parser] Streaming parser missed tool block; fallback extraction recovered it', {
              recovered: fallback.map((b) => b.name),
              round,
            })
          }
        }
        if (toolBlocks.length === 0) {
          debugLog('round finished with no tool blocks', { round })
          break
        }

        const block = toolBlocks[0]
        const displayLine = formatDisplayForActivityLog(block.name, block.args || {}, null)
        win.webContents.send('chat:tool', [{ ...block, display: displayLine, round }])
        win.webContents.send('chat:status', { value: 'tool_run', content: `Running: ${block.name}...` })

        const dispatch = await dispatchToolBlock(block, sessionId)
        debugLog('tool dispatch result', {
          round,
          name: dispatch.name,
          ok: dispatch.ok,
          resultLength: dispatch.resultText?.length || 0,
        })
        const wrappedResult = formatResult(dispatch.name, dispatch.resultText)
        conversation.push({ role: 'user', content: wrappedResult })

        win.webContents.send('chat:status', {
          value: dispatch.ok ? 'tool_done' : 'tool_error',
          content: dispatch.ok ? `Done: ${dispatch.name}` : `Error: ${dispatch.name}`,
        })
      }

      if (!abortController.signal.aborted) {
        debugLog('chat:send done', {
          finalVisibleLength: finalVisibleContent.length,
          reasoningLength: reasoningBuffer.length,
        })
        win.webContents.send('chat:usage', {
          tokens: finalVisibleContent.length / 4,
          cost: 0,
        })

        win.webContents.send('chat:done', { content: finalVisibleContent, reasoning: reasoningBuffer })
      }
    } catch (err) {
      debugLog('chat:send error', {
        message: err?.message || String(err),
        stack: err?.stack || null,
      })
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
