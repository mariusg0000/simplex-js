import fs from 'fs'
import path from 'path'
import { config } from '../main/config.js'

export class AgentRegistry {
  constructor() {
    this.agents = new Map()
  }

  discover() {
    const agentDirs = [
      path.join(config.simplexHome, 'agents'),
      path.join(process.cwd(), 'agents'),
    ]

    for (const dir of agentDirs) {
      if (!fs.existsSync(dir)) continue
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8')
        const agent = this.parseAgentMd(content, file)
        if (agent) this.agents.set(agent.name, agent)
      }
    }
  }

  parseAgentMd(content, filename) {
    const nameMatch = content.match(/^#\s+(.+)/m)
    const roleMatch = content.match(/##\s*Role\s*\n([\s\S]*?)(?=\n##|\Z)/)
    const toolsMatch = content.match(/##\s*Allowed Tools\s*\n([\s\S]*?)(?=\n##|\Z)/)

    if (!nameMatch) return null

    return {
      name: nameMatch[1].trim(),
      filename,
      rolePrompt: roleMatch ? roleMatch[1].trim() : '',
      allowedTools: toolsMatch
        ? toolsMatch[1].trim().split('\n').map((t) => t.trim().replace(/^-\s*/, '')).filter(Boolean)
        : [],
    }
  }

  get(name) {
    return this.agents.get(name)
  }

  list() {
    return Array.from(this.agents.values())
  }
}
