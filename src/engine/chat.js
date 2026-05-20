export class ChatEngine {
  constructor(llmClient, pythonBridge, toolRegistry, agentRegistry) {
    this.llmClient = llmClient
    this.pythonBridge = pythonBridge
    this.toolRegistry = toolRegistry
    this.agentRegistry = agentRegistry
    this.abortController = null
  }

  async *streamChat(messages, llmConfig) {
    this.abortController = new AbortController()

    const stream = this.llmClient.streamChat(messages, llmConfig)

    for await (const event of stream) {
      if (this.abortController.signal.aborted) break
      yield event
    }
  }

  cancel() {
    this.abortController?.abort()
  }
}
