/**
 * client.js — src/main/llm/client.js
 * Wrapper around the OpenAI SDK to handle chat completions and streaming.
 * Layer: Main Process / Dependencies: openai
 */
import OpenAI from 'openai'

/**
 * WHAT:    Asynchronously yields streaming chat tokens/reasoning from the LLM provider.
 * WHY:     Exposes a unified streaming interface for the main process handlers.
 * HOW:     Instantiates OpenAI client and passes options (including AbortSignal) to chat.completions.create.
 * PARAMS:  messages: Array - Array of message objects for the chat history.
 *          config: Object - LLM parameters including apiKey, apiBase, model, temperature, maxTokens, and optional signal.
 * RETURNS: AsyncGenerator yielding event objects with type 'content' or 'reasoning'.
 */
export async function* streamChat(messages, config) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBase,
  })

  const stream = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  }, {
    signal: config.signal,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    if (delta?.content) {
      yield { type: 'content', content: delta.content }
    }
    if (delta?.reasoning_content) {
      yield { type: 'reasoning', content: delta.reasoning_content }
    }
  }
}

/**
 * WHAT:    Performs a non-streaming single completion call to the LLM provider.
 * WHY:     Used for simple direct prompts where streaming is not required.
 * HOW:     Calls OpenAI SDK completions API without stream parameter.
 * PARAMS:  messages: Array - Array of message objects for the chat history.
 *          config: Object - LLM parameters including apiKey, apiBase, model, temperature, maxTokens.
 * RETURNS: Promise<string> - The assistant's text reply.
 */
export async function complete(messages, config) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBase,
  })

  const response = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  })

  return response.choices[0]?.message?.content || ''
}

