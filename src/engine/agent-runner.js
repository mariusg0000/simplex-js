import { streamChat } from '../main/llm/client.js'
import { config } from '../main/config.js'
import { toolRegistry } from './tool-registry.js'
import { executeTool } from './python-bridge.js'
import { StreamingToolParser, formatResult, formatDisplayForActivityLog } from './tool-parser.js'
import { buildToolsSection } from '../main/system-prompt.js'

export class AgentStep {
  constructor(agentName, round, stepType, content) {
    this.agentName = agentName
    this.round = round
    this.stepType = stepType
    this.content = content
    this.timestamp = new Date().toLocaleTimeString()
  }
}

export class AgentStreamChunk {
  constructor(agentName, round, chunkType, content) {
    this.agentName = agentName
    this.round = round
    this.chunkType = chunkType
    this.content = content
    this.timestamp = new Date().toLocaleTimeString()
  }
}

const AGENT_DONE_PREFIX = '_AGENT_DONE_:'

export class ToolCapableAgent {
  constructor({ name, rolePrompt, allowedTools = null, doneToolName = 'task_done', workDir = '', maxRounds = 20 }) {
    this.name = name
    this.rolePrompt = rolePrompt
    this.allowedTools = allowedTools ? new Set(allowedTools) : null
    this.doneToolName = doneToolName
    this.workDir = workDir
    this.maxRounds = maxRounds
    this.messages = []
  }

  _getAllowedSchemas() {
    const allSchemas = toolRegistry.list().filter((t) => t.parameters)
    if (!this.allowedTools || this.allowedTools.size === 0) return allSchemas
    return allSchemas.filter((s) => this.allowedTools.has(s.name))
  }

  _buildSystemPrompt() {
    const lines = [this.rolePrompt]

    if (this.allowedTools && this.allowedTools.size > 0) {
      const toolNames = [...this.allowedTools]
      const matchSchemas = toolRegistry.list().filter((t) => toolNames.includes(t.name))
      const toolSection = buildToolsSection(matchSchemas)
      if (toolSection) lines.push(toolSection)
    }

    const sandboxNote = `SANDBOX: ${this.workDir}
All work happens HERE and ONLY HERE. Scripts, temp files, final documents —
everything must be created inside this directory. No exceptions.`
    lines.push(sandboxNote)

    return lines.join('\n\n')
  }

  async _dispatchTool(block) {
    const name = block.name
    const args = { ...(block.args || {}) }

    const tool = toolRegistry.get(name)
    if (!tool) {
      return `Error: Tool '${name}' not found.`
    }

    if (this.workDir) {
      args._agent_params = { work_dir: this.workDir }
    }

    try {
      const result = executeTool(tool.path, args)
      return String(result)
    } catch (err) {
      return `Error executing tool '${name}': ${err.message || String(err)}`
    }
  }

  async run(taskInput, { onStep = null, onStream = null, modelOverride = null } = {}) {
    const systemPrompt = this._buildSystemPrompt()
    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: taskInput },
    ]

    let lastToolName = null
    let gaveFallback = false
    let maxRounds = this.maxRounds

    for (let round = 1; round <= maxRounds; round += 1) {
      if (onStep) onStep(new AgentStep(this.name, round, 'llm_call', 'Thinking...'))

      const modelStr = modelOverride || config.chatModel
      const modelConfig = config.resolveModel(modelStr)

      const schemas = this._getAllowedSchemas()
      const knownTools = new Set(schemas.map((s) => s.name))
      const parser = new StreamingToolParser(knownTools)
      let fullContent = ''

      try {
        const stream = streamChat(this.messages, {
          apiKey: modelConfig.apiKey,
          apiBase: modelConfig.apiBase,
          model: modelConfig.model,
          temperature: 0.1,
          maxTokens: config.maxTokens,
        })

        for await (const event of stream) {
          if (event.type === 'reasoning') {
            if (onStream) onStream(new AgentStreamChunk(this.name, round, 'reasoning', event.content))
          }
          if (event.type === 'content') {
            fullContent += event.content
            for (const parsedEvent of parser.feed(event.content)) {
              if (parsedEvent.type === 'content' && parsedEvent.content) {
                if (onStream) onStream(new AgentStreamChunk(this.name, round, 'content', parsedEvent.content))
              }
            }
          }
        }

        for (const parsedEvent of parser.flush()) {
          if (parsedEvent.type === 'content' && parsedEvent.content) {
            if (onStream) onStream(new AgentStreamChunk(this.name, round, 'content', parsedEvent.content))
          }
        }
      } catch (err) {
        if (onStep) onStep(new AgentStep(this.name, round, 'error', err.message || String(err)))
        return `Error: ${err.message || String(err)}`
      }

      const toolBlocks = parser.toolBlocks || []
      const hasToolCalls = toolBlocks.length > 0

      if (!hasToolCalls) {
        if (lastToolName === null || lastToolName !== this.doneToolName) {
          if (onStep) onStep(new AgentStep(this.name, round, 'tool_call', 'No tool calls — nudging'))
          const nudge = `\n\nYou must use tools to complete this task. Output XML blocks like <tool_name><param>value</param></tool_name>. Do NOT plan in text — call a tool now.`
          this.messages.push({ role: 'user', content: nudge })
          continue
        }
        const output = fullContent || ''
        if (onStep) onStep(new AgentStep(this.name, round, 'done', output.slice(0, 200)))
        return output
      }

      const assistantMsg = { role: 'assistant', content: fullContent }
      this.messages.push(assistantMsg)

      for (const block of toolBlocks.slice(0, 1)) {
        const name = block.name
        const args = block.args || {}

        if (onStep) {
          const label = formatDisplayForActivityLog(name, args, null)
          onStep(new AgentStep(this.name, round, 'tool_call', label))
        }

        const resultStr = await this._dispatchTool(block)
        lastToolName = name

        if (onStep) {
          onStep(new AgentStep(this.name, round, 'tool_result', resultStr.slice(0, 200)))
        }

        if (resultStr.startsWith(AGENT_DONE_PREFIX)) {
          const afterPrefix = resultStr.slice(AGENT_DONE_PREFIX.length).trim()
          const doneResult = afterPrefix.startsWith(':') ? afterPrefix.slice(1).trim() : afterPrefix
          if (onStep) onStep(new AgentStep(this.name, round, 'done', doneResult.slice(0, 200)))
          const sessionTag = this.workDir ? `\n[Session folder: ${this.workDir}]` : ''
          return doneResult + sessionTag
        }

        const remaining = maxRounds - round
        let roundTag = `\n\n[Round ${round}/${maxRounds}`
        if (remaining <= 3) roundTag += ' CRITICAL — finish now!'
        else if (remaining <= 6) roundTag += ` only ${remaining} left`
        roundTag += ']'

        this.messages.push({
          role: 'user',
          content: formatResult(name, resultStr) + roundTag,
        })
      }

      if (round === maxRounds && !gaveFallback) {
        this.messages.push({
          role: 'user',
          content: `Maximum attempts reached. Call ${this.doneToolName}(result='...') with what you have. Do NOT continue working on the task.`,
        })
        maxRounds += 1
        this.maxRounds = maxRounds
        gaveFallback = true
      }
    }

    const report = `[AGENT: ${this.name}] Max rounds (${this.maxRounds}) reached. [Partial results may exist in the session folder.]`
    if (onStep) onStep(new AgentStep(this.name, this.maxRounds, 'error', report))
    return report
  }
}
