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
    model: config.model,
    apiBase: config.apiBase,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
  }))

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
    const { messages, sessionId } = payload
    const win = getMainWindow()
    if (!win) return

    abortController = new AbortController()

    try {
      const systemPrompt = buildSystemPrompt([], [], [])
      const fullMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages

      const parser = new StreamingToolParser()
      let contentBuffer = ''
      let reasoningBuffer = ''

      const stream = streamChat(fullMessages, {
        apiKey: config.apiKey,
        apiBase: config.apiBase,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
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
