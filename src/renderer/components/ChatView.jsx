/**
 * ChatView.jsx — src/renderer/components/ChatView.jsx
 * Main chat panel: message list, suggestion chips empty state,
 * auto-resizing textarea input, send/abort button.
 */
import React from 'react'
import { ChatBubble } from './ChatBubble.jsx'
import { ReasoningBlock } from './ReasoningBlock.jsx'
import { ToolCallCard } from './ToolCallCard.jsx'
import { Send, Square } from 'lucide-react'

const ALL_SUGGESTIONS = [
  // Office / General
  'Redactează o minută de ședință pe baza unor notițe rapide',
  'Ajutor cu redactarea unui e-mail oficial către clienți',
  'Organizează un plan de lucru săptămânal pentru echipă',
  'Proiectează structura unei prezentări de afaceri comerciale',
  'Formulează o listă de răspunsuri pentru întrebări frecvente',
  'Ajutor cu traducerea și adaptarea unui e-mail în mod profesional',
  
  // Accounting / Financial
  'Explică deducerile fiscale aplicabile microîntreprinderilor',
  'Ajutor cu o formulă complexă în Excel / Google Sheets',
  'Analizează abaterile dintr-un buget de venituri și cheltuieli',
  'Cum se calculează corect amortizarea liniară a mijloacelor fixe?',
  'Verifică criteriile legale pentru deductibilitatea TVA',
  'Ajutor cu structurarea unui raport de flux de numerar (Cash Flow)',
  
  // Legal / Contracts
  'Redactează o clauză de confidențialitate (NDA) standard',
  'Analizează riscurile potențiale dintr-un contract de prestări servicii',
  'Explică obligațiile GDPR privind stocarea datelor angajaților',
  'Pregătește o notificare oficială de reziliere a unui contract',
  'Verifică termenele legale pentru preavizul în caz de demisie',
  'Ajutor cu redactarea unei procuri speciale de reprezentare'
]

/**
 * WHAT:    Renders the chat interface including conversation bubbles, loading states, and the message composer.
 * WHY:     Provides the primary visual workspace for user interaction.
 * HOW:     Uses sub-components for message blocks, a text composer with auto-resize, and stable random starter suggestions.
 * PARAMS:  props: Object - Component properties including messages, onSend, streaming, reasoning, onAbort.
 * RETURNS: React.ReactElement representing the chat interface.
 */
export function ChatView({ messages, onSend, streaming, reasoning, onAbort }) {
  const [input, setInput] = React.useState('')
  const messagesEndRef = React.useRef(null)
  const textareaRef = React.useRef(null)

  const extractDroppedPaths = React.useCallback((event) => {
    const dt = event.dataTransfer
    if (!dt) return []

    const filePaths = Array.from(dt.files || [])
      .map((f) => window.ipc.getPathForFile?.(f) || f.path || '')
      .filter(Boolean)

    if (filePaths.length > 0) return filePaths

    const uriList = dt.getData('text/uri-list')
    if (uriList) {
      return uriList
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          if (!line.startsWith('file://')) return line
          try {
            return decodeURI(line.replace('file://', ''))
          } catch {
            return line.replace('file://', '')
          }
        })
    }

    return []
  }, [])

  const handleDrop = React.useCallback((event) => {
    event.preventDefault()
    const paths = extractDroppedPaths(event)
    if (paths.length === 0) return

    const textToInsert = paths.join(' ')
    setInput((prev) => {
      if (!prev.trim()) return textToInsert
      const sep = prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '
      return `${prev}${sep}${textToInsert}`
    })
    textareaRef.current?.focus()
  }, [extractDroppedPaths])

  const handleDragOver = React.useCallback((event) => {
    event.preventDefault()
  }, [])

  // Choose 4 random stable suggestions on new chat
  const suggestions = React.useMemo(() => {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, 4)
  }, [messages.length])

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || streaming) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const inputArea = (
    <div className="input-area">
      <div className="input-area-inner">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          disabled={!!streaming}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        />
        {streaming ? (
          <button className="btn-abort" onClick={onAbort} title="Stop generating">
            <Square size={14} />
          </button>
        ) : (
          <button className="btn-send" onClick={handleSubmit} title="Send (Enter)">
            <Send size={14} />
          </button>
        )}
      </div>
      <div className="input-hint">⏎ Send · ⇧⏎ New line</div>
    </div>
  )

  if (messages.length === 0 && !streaming) {
    return (
      <div className="chat-view" onDrop={handleDrop} onDragOver={handleDragOver}>
        <div className="empty-state">
          <div className="empty-state-icon">
            <Send size={24} />
          </div>
          <h2>Simplex AI</h2>
          <p>Send a message to start chatting</p>
          <div className="empty-state-chips">
            {suggestions.map((s) => (
              <button
                key={s}
                className="suggestion-chip"
                onClick={() => { setInput(s); textareaRef.current?.focus() }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {inputArea}
      </div>
    )
  }

  return (
    <div className="chat-view" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="messages-container">
        {messages.map((msg, i) => {
          if (msg.type === 'reasoning') {
            return <ReasoningBlock key={i} content={msg.content} />
          }
          if (msg.type === 'tool') {
            return <ToolCallCard key={i} name={msg.name} args={msg.args} result={msg.result} />
          }
          if (msg.role === 'user' || msg.role === 'assistant') {
            return <ChatBubble key={i} role={msg.role} content={msg.content} />
          }
          return null
        })}
        {streaming && <ChatBubble role="assistant" content={streaming} streaming />}
        {reasoning && <ReasoningBlock content={reasoning} />}
        <div ref={messagesEndRef} />
      </div>
      {inputArea}
    </div>
  )
}
