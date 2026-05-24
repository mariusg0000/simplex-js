/**
 * useChat.js — src/renderer/hooks/useChat.js
 * Custom React hook to manage chat states (messages, streaming, cost) and handle IPC communication.
 * Layer: Renderer Hook / Dependencies: React, window.ipc
 */
import React from 'react'

/**
 * WHAT:    React hook managing chat state (messages, streaming buffers, cost) and IPC messaging.
 * WHY:     Decouples chat view components from Electron IPC logic and coordinates message flows.
 * HOW:     Registers Electron IPC listeners on send, coordinates state updates, and cleans up listeners to avoid leaks.
 * PARAMS:  config: { onSave?: Function, getSettings?: Function } - Optional handlers for saving session and getting model configuration.
 * RETURNS: Object containing chat state (messages, streaming, cost, status) and event handlers (send, cancel).
 */
export function useChat({ onSave, getSettings } = {}) {
  const [messages, setMessages] = React.useState([])
  const [streaming, setStreaming] = React.useState(null)
  const [reasoning, setReasoning] = React.useState(null)
  const [tokenCount, setTokenCount] = React.useState(0)
  const [cost, setCost] = React.useState(0)
  const [status, setStatus] = React.useState('Ready')

  const cleanupRef = React.useRef([])

  const runCleanups = () => {
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []
  }

  React.useEffect(() => {
    return runCleanups
  }, [])

  /**
   * WHAT:    Sends a list of messages to the main process via IPC and sets up streaming event listeners.
   * WHY:     Triggers the background LLM completion process and updates UI state as tokens arrive.
   * HOW:     Cleans up prior listeners, registers new IPC listeners for streaming events, and invokes 'chat:send'.
   * PARAMS:  msgs: Array - List of message objects.
   *          sessionId: string|null - Active chat session identifier.
   * RETURNS: none
   */
  const send = (msgs, sessionId) => {
    runCleanups()
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
        if (reasoning) assistantMsg.reasoning = ' '
        const updated = [...prev, assistantMsg]
        onSave?.(updated, sessionId)
        return updated
      })
      setStreaming(null)
      if (reasoning) setReasoning(reasoning)
      setStatus('Ready')
      runCleanups()
    }))

    cleanups.push(window.ipc.on('chat:error', (err) => {
      setStatus(`Error: ${err}`)
      runCleanups()
    }))

    cleanups.push(window.ipc.on('chat:usage', ({ tokens, cost: c }) => {
      setTokenCount(tokens)
      setCost(c)
    }))

    cleanupRef.current = cleanups

    window.ipc.send('chat:send', { messages: msgs, sessionId, settings: getSettings?.() })
  }

  const cancel = () => {
    window.ipc.send('chat:cancel')
    setStreaming(null)
    setStatus('Cancelled')
    runCleanups()
  }

  return { messages, setMessages, streaming, reasoning, tokenCount, cost, status, send, cancel }
}
