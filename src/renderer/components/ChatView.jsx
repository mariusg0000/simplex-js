import React from 'react'
import { ChatBubble } from './ChatBubble.jsx'
import { ReasoningBlock } from './ReasoningBlock.jsx'
import { ToolCallCard } from './ToolCallCard.jsx'

export function ChatView({ messages, onSend, streaming, reasoning }) {
  const [input, setInput] = React.useState('')
  const messagesEndRef = React.useRef(null)
  const textareaRef = React.useRef(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  if (messages.length === 0 && !streaming) {
    return (
      <div className="chat-view">
        <div className="empty-state">
          <h2>Simplex AI</h2>
          <p>Send a message to start chatting</p>
        </div>
        <div className="input-area">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
          />
          <button className="btn btn-primary" onClick={handleSubmit}>Send</button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-view">
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
        {streaming && (
          <ChatBubble role="assistant" content={streaming} streaming />
        )}
        {reasoning && <ReasoningBlock content={reasoning} />}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-area">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
        />
        <button className="btn btn-primary" onClick={handleSubmit}>
          Send
        </button>
      </div>
    </div>
  )
}
