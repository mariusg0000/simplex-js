import { config } from './config.js'

export function buildSystemPrompt(tools, agents, skills) {
  const parts = [config.systemPrompt]

  if (tools.length > 0) {
    parts.push('\n\n## Available Tools\n')
    for (const tool of tools) {
      parts.push(`- **${tool.name}**: ${tool.description}`)
      if (tool.parameters) {
        parts.push(`  Parameters: ${JSON.stringify(tool.parameters)}`)
      }
    }
  }

  if (agents.length > 0) {
    parts.push('\n\n## Available Agents (sub-agents you can invoke)\n')
    for (const agent of agents) {
      parts.push(`- **${agent.name}**: ${agent.rolePrompt.slice(0, 100)}`)
    }
  }

  return parts.join('\n')
}
