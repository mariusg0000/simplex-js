import React from 'react'
import { ChatView } from './components/ChatView.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Settings } from './components/Settings.jsx'
import { StatusBar } from './components/StatusBar.jsx'
import { useSessions } from './hooks/useSessions.js'
import { useSettings } from './hooks/useSettings.js'
import { useChat } from './hooks/useChat.js'

export default function App() {
  const [showSettings, setShowSettings] = React.useState(false)
  const sessions = useSessions()
  const settings = useSettings()
  const chat = useChat({
    onSave: async (messages, sessionId) => {
      let currentId = sessions.currentId()
      if (!currentId) {
        const title = messages.find((m) => m.role === 'user')?.content?.slice(0, 50) || 'New Chat'
        currentId = await sessions.create(title)
      }
      await sessions.saveMessages(currentId, messages)
    },
    getSettings: () => settings.values,
  })

  const handleSelectSession = async (id) => {
    const session = await sessions.load(id)
    if (session) {
      chat.setMessages(session.messages || [])
      sessions.setCurrentId(id)
    }
  }

  const handleNewSession = () => {
    sessions.create()
    chat.setMessages([])
  }

  const handleSend = async (content) => {
    const msg = { role: 'user', content }
    const updatedMessages = [...chat.messages, msg]
    chat.setMessages(updatedMessages)

    let currentId = sessions.currentId()
    if (!currentId) {
      currentId = await sessions.create(content.slice(0, 50))
    }

    chat.send(updatedMessages, currentId)
  }

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions.list()}
        currentId={sessions.currentId()}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={sessions.remove}
        onRename={sessions.rename}
        onSettings={() => setShowSettings(true)}
      />
      <div className="main-area">
        <ChatView
          messages={chat.messages}
          onSend={handleSend}
          streaming={chat.streaming}
          reasoning={chat.reasoning}
        />
        <StatusBar
          tokens={chat.tokenCount}
          cost={chat.cost}
          status={chat.status}
        />
      </div>
      {showSettings && (
        <Settings
          settings={settings.values}
          availableModels={settings.availableModels}
          modelsLoading={settings.modelsLoading}
          onSave={settings.save}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
