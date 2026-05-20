import React from 'react'

export function useChat({ onSave } = {}) {
  const [messages, setMessages] = React.useState([])
  const [streaming, setStreaming] = React.useState(null)
  const [reasoning, setReasoning] = React.useState(null)
  const [tokenCount, setTokenCount] = React.useState(0)
  const [cost, setCost] = React.useState(0)
  const [status, setStatus] = React.useState('Ready')

  const send = (msgs, sessionId) => {
    setStatus('Streaming...')

    const cleanups = []

    cleanups.push(window.ipc.on('chat:chunk', (content) => {
      setStreaming((prev) => (prev || '') + content)
    }))

    cleanups.push(window.ipc.on('chat:reasoning', (content) => {
      setReasoning((prev) => (prev || '') + content)
    }))

    cleanups.push(window.ipc.on('chat:done', ({ content, reasoning }) => {
      setMessages((prev) => {
        const assistantMsg = { role: 'assistant', content: content || '' }
        if (reasoning) assistantMsg.reasoning = reasoning
        const updated = [...prev, assistantMsg]
        onSave?.(updated, sessionId)
        return updated
      })
      setStreaming(null)
      setReasoning(null)
      setStatus('Ready')
      cleanups.forEach((fn) => fn())
    }))

    cleanups.push(window.ipc.on('chat:error', (err) => {
      setStatus(`Error: ${err}`)
      cleanups.forEach((fn) => fn())
    }))

    cleanups.push(window.ipc.on('chat:usage', ({ tokens, cost: c }) => {
      setTokenCount(tokens)
      setCost(c)
    }))

    window.ipc.send('chat:send', { messages: msgs, sessionId })
  }

  const cancel = () => {
    window.ipc.send('chat:cancel')
    setStreaming(null)
    setReasoning(null)
    setStatus('Cancelled')
  }

  return { messages, setMessages, streaming, reasoning, tokenCount, cost, status, send, cancel }
}
