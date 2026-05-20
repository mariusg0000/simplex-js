import React from 'react'
import { MarkdownRenderer } from './MarkdownRenderer.jsx'

export function ChatBubble({ role, content, streaming }) {
  const className = `chat-bubble ${role}`

  return (
    <div className={className}>
      <div className="role-label">{role === 'user' ? 'You' : 'AI'}</div>
      <MarkdownRenderer content={content} />
      {streaming && <span className="stream-indicator" />}
    </div>
  )
}
