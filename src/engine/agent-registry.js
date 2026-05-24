import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from '../main/config.js'
import { ToolCapableAgent } from './agent-runner.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseAgentMd(content) {
  const sections = {}
  const lines = content.split('\n')
  let current = null
  let buf = []

  for (const line of lines) {
    const m = line.trim().match(/^##\s+(\S+)\s*$/)
    if (m) {
      if (current) sections[current] = buf.join('\n').trim()
      current = m[1].toLowerCase()
      buf = []
    } else {
      buf.push(line)
    }
  }

  if (current) sections[current] = buf.join('\n').trim()
  return sections
}

export class AgentRegistry {
  constructor() {
    this._agents = new Map()
    this.discoverBuiltin()
    this.discoverCustom()
  }

  discoverBuiltin() {
    const dir = path.resolve(__dirname, '..', 'agents')
    this._discover(dir, 'built-in')
  }

  discoverCustom() {
    const dir = path.join(config.simplexHome, 'agents')
    this._discover(dir, 'custom')
  }

  _discover(dir, _sourceLabel) {
    if (!fs.existsSync(dir)) return
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue
      try {
        const fullPath = path.join(dir, file)
        const raw = fs.readFileSync(fullPath, 'utf-8')
        const sections = parseAgentMd(raw)

        const required = ['enabled', 'agent_description', 'allowed_tools', 'role_prompt']
        const missing = required.filter((k) => !sections[k])
        if (missing.length > 0) continue

        const enabled = sections.enabled.trim().toLowerCase() === 'enabled'
        const name = path.basename(file, '.md')
        const description = sections.agent_description.trim()
        const allowedTools = sections.allowed_tools
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        const rolePrompt = sections.role_prompt.trim()
        const doneTool = (sections.done_tool || '').trim() || 'task_done'
        const model = (sections.model || '').trim()

        this._agents.set(name, {
          name,
          enabled,
          description,
          allowedTools,
          rolePrompt,
          doneTool,
          model,
        })
      } catch {
        // skip
      }
    }
  }

  get(name) {
    return this._agents.get(name)
  }

  list() {
    return Array.from(this._agents.values()).filter((a) => a.enabled)
  }

  getDescriptions() {
    const parts = []
    for (const agent of this.list()) {
      parts.push(`[Agent: ${agent.name}]\n${agent.description}`)
    }
    return parts.join('\n\n')
  }

  async call(name, args, sessionFolder = '') {
    const agent = this._agents.get(name)
    if (!agent) return `Error: Agent '${name}' not found.`

    const task = String(args?.task || '')

    const MAX_TASK_LENGTH = 2000
    if (task.length > MAX_TASK_LENGTH) {
      return (
        `Error: task too long (${task.length} chars, max ${MAX_TASK_LENGTH}). ` +
        'Put document content in files in the session folder and pass filenames ' +
        'in the task text instead. Do NOT inline content.'
      )
    }

    let workDir = sessionFolder
    const reuseWorkDir = args?.work_dir
    if (reuseWorkDir) {
      if (!fs.existsSync(reuseWorkDir) || !fs.statSync(reuseWorkDir).isDirectory()) {
        return `Error: Specified work_dir '${reuseWorkDir}' does not exist or is not a directory.`
      }
      workDir = reuseWorkDir
    }

    if (!workDir) {
      return `Error: No session folder available. Cannot run agent '${name}'.`
    }

    const resolvedPrompt = agent.rolePrompt.replace(/\{work_dir\}/g, workDir)

    const runner = new ToolCapableAgent({
      name,
      rolePrompt: resolvedPrompt,
      allowedTools: agent.allowedTools,
      doneToolName: agent.doneTool,
      workDir,
      maxRounds: 20,
    })

    const modelOverride = agent.model || null

    try {
      const result = await runner.run(task, { modelOverride })
      const sessionTag = `[Session folder: ${workDir}]`
      if (!result.includes(sessionTag)) {
        return `${result}\n${sessionTag}`
      }
      return result
    } catch (err) {
      return `Error running agent '${name}': ${err.message || String(err)}`
    }
  }
}

export const agentRegistry = new AgentRegistry()
