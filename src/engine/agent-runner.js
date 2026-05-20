import { complete } from '../main/llm/client.js'
import { config } from '../main/config.js'
import { extractToolBlocks, formatResult } from './tool-parser.js'

export class ToolCapableAgent {
  constructor(name, rolePrompt, allowedTools, llmConfig, pythonBridge, maxRounds = 20, doneToolName = 'task_done') {
    this.name = name
    this.rolePrompt = rolePrompt
    this.allowedTools = allowedTools
    this.llmConfig = llmConfig
    this.pythonBridge = pythonBridge
    this.maxRounds = maxRounds
    this.doneToolName = doneToolName
  }

  async run(taskInput, callbacks = {}) {
    const messages = [
      { role: 'system', content: this.rolePrompt },
      { role: 'user', content: taskInput },
    ]

    for (let round = 0; round < this.maxRounds; round++) {
      callbacks.onRound?.(round)

      const response = await complete(messages, this.llmConfig)

      messages.push({ role: 'assistant', content: response })
      callbacks.onAssistantMessage?.(response)

      const toolBlocks = extractToolBlocks(response)

      if (toolBlocks.length === 0) {
        return response
      }

      for (const block of toolBlocks) {
        if (block.name === this.doneToolName) {
          callbacks.onDone?.(block.content)
          return block.content
        }

        if (!this.allowedTools.includes(block.name)) {
          const err = `Tool "${block.name}" is not allowed for agent "${this.name}"`
          messages.push({ role: 'tool', content: err, name: block.name })
          continue
        }

        callbacks.onToolCall?.(block)

        let args
        try {
          args = this.parseArgs(block.content)
        } catch {
          args = { input: block.content }
        }

        const result = await this.pythonBridge.executeTool(block.name, { ...args, _agent_params: { work_dir: process.cwd() } })
        const formatted = formatResult(block.name, args, result)
        messages.push({ role: 'tool', content: formatted, name: block.name })
        callbacks.onToolResult?.(block.name, result)
      }
    }

    return 'Agent reached max rounds without completing the task.'
  }

  parseArgs(content) {
    const args = {}
    const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
    let match
    while ((match = paramRegex.exec(content)) !== null) {
      args[match[1]] = match[2].trim()
    }
    return args
  }
}
