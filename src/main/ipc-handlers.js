import { ipcMain, BrowserWindow } from 'electron'
import { config } from './config.js'
import { storage } from './storage.js'
import { database } from './database.js'
import { streamChat } from './llm/client.js'
import { buildSystemPrompt } from './system-prompt.js'
import { StreamingToolParser } from '../engine/tool-parser.js'

let abortController = null

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0]
}

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
    const { executeTool } = await import('../engine/python-bridge.js')
    return executeTool(toolName, args)
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
      const systemMsg = buildSystemPrompt([], [], [], sessionDir)
      const fullMessages = [systemMsg, ...messages]

      const parser = new StreamingToolParser()
      let contentBuffer = ''
      let reasoningBuffer = ''

      const stream = streamChat(fullMessages, {
        apiKey: modelConfig.apiKey,
        apiBase: modelConfig.apiBase,
        model: modelConfig.model,
        temperature: settings?.temperature ?? config.temperature,
        maxTokens: settings?.maxTokens ?? config.maxTokens,
      })

      for await (const event of stream) {
        if (abortController.signal.aborted) break

        if (event.type === 'content') {
          contentBuffer += event.content
          win.webContents.send('chat:chunk', event.content)
          parser.feed(event.content)
        }

        if (event.type === 'reasoning') {
          reasoningBuffer += event.content
          win.webContents.send('chat:reasoning', event.content)
        }
      }

      if (!abortController.signal.aborted) {
        const toolBlocks = parser.extractBlocks()
        if (toolBlocks.length > 0) {
          win.webContents.send('chat:tool', toolBlocks)
        }

        win.webContents.send('chat:usage', {
          tokens: contentBuffer.length / 4,
          cost: 0,
        })

        win.webContents.send('chat:done', { content: contentBuffer, reasoning: reasoningBuffer })
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
