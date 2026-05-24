/**
 * index.cjs — src/preload/index.cjs
 * Preload script exposing a secure, whitelisted IPC interface to the renderer.
 * Layer: Preload Script / Dependencies: electron
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('ipc', {
  invoke(channel, ...args) {
    const validChannels = [
      'sessions:list',
      'sessions:load',
      'sessions:save',
      'sessions:delete',
      'sessions:archive',
      'sessions:dir',
      'settings:load',
      'settings:save',
      'config:load',
      'config:save',
      'providers:list',
      'models:list',
      'tools:inspect',
      'tools:execute',
    ]
    if (!validChannels.includes(channel)) {
      throw new Error(`Invalid IPC channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on(channel, callback) {
    const validChannels = [
      'chat:chunk',
      'chat:reasoning',
      'chat:tool',
      'chat:status',
      'chat:usage',
      'chat:done',
      'chat:error',
    ]
    if (!validChannels.includes(channel)) return

    const handler = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  send(channel, ...args) {
    const validChannels = ['chat:send', 'chat:cancel']
    if (!validChannels.includes(channel)) return
    ipcRenderer.send(channel, ...args)
  },

  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
})
