import React from 'react'

export function useSessions() {
  const [sessionList, setSessionList] = React.useState([])
  const [currentId, setCurrentId] = React.useState(null)

  const refresh = React.useCallback(async () => {
    const list = await window.ipc.invoke('sessions:list')
    setSessionList(list)
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const create = async (title = 'New Chat') => {
    const id = await window.ipc.invoke('sessions:save', { title, messages: [] })
    setCurrentId(id)
    refresh()
    return id
  }

  const load = async (id) => {
    return window.ipc.invoke('sessions:load', id)
  }

  const remove = async (id) => {
    await window.ipc.invoke('sessions:delete', id)
    if (currentId === id) {
      setCurrentId(null)
    }
    refresh()
  }

  const rename = async (id, title) => {
    const session = await load(id)
    if (session) {
      await window.ipc.invoke('sessions:save', { id, title, messages: session.messages })
      refresh()
    }
  }

  const saveMessages = async (sessionId, messages) => {
    if (!sessionId) return
    const title = messages.find((m) => m.role === 'user')?.content?.slice(0, 50) || 'New Chat'
    await window.ipc.invoke('sessions:save', { id: sessionId, title, messages })
    refresh()
  }

  const getSessionDir = async (id) => {
    return window.ipc.invoke('sessions:dir', id)
  }

  return {
    list: () => sessionList,
    currentId: () => currentId,
    setCurrentId,
    create,
    load,
    remove,
    rename,
    saveMessages,
    getSessionDir,
  }
}
