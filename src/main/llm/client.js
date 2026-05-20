import OpenAI from 'openai'

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
