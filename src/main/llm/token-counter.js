import { getEncoding } from 'tiktoken'

const enc = getEncoding('cl100k_base')

export function countTokens(text) {
  return enc.encode(text).length
}

export function countMessagesTokens(messages) {
  let total = 0
  for (const msg of messages) {
    total += countTokens(msg.role + msg.content)
  }
  return total
}

export function trimMessages(messages, maxTokens = 8192) {
  let total = countMessagesTokens(messages)
  while (total > maxTokens && messages.length > 1) {
    messages.shift()
    total = countMessagesTokens(messages)
  }
  return messages
}
