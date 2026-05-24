import fs from 'fs'
import path from 'path'
import { config } from '../main/config.js'
import { inspectTool } from './python-bridge.js'

export class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  async discover() {
    const toolDirs = [
      path.join(config.simplexHome, 'tools'),
      path.join(process.cwd(), 'tools'),
    ]

    for (const dir of toolDirs) {
      if (!fs.existsSync(dir)) continue
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.py'))
      for (const file of files) {
        try {
          const schema = await inspectTool(path.join(dir, file))
          this.tools.set(schema.name, { ...schema, path: path.join(dir, file) })
        } catch {
          // skip tools that fail inspection
        }
      }
    }
  }

  get(name) {
    return this.tools.get(name)
  }

  list() {
    return Array.from(this.tools.values())
  }

  getMainAgentTextDescriptions() {
    const tools = this.list()
    if (tools.length === 0) return ''

    const lines = [
      '## AVAILABLE TOOLS',
      '',
      'Call tools with XML blocks:',
      '<tool_name>',
      '  <param_name>value</param_name>',
      '</tool_name>',
      '',
      'Tools:',
    ]

    for (const tool of tools) {
      const desc = (tool.description || '').trim()
      lines.push(`• ${tool.name} — ${desc}`)
      const props = tool.parameters?.properties || {}
      const required = new Set(tool.parameters?.required || [])
      const example = [`<${tool.name}>`]
      for (const [pName, pInfo] of Object.entries(props)) {
        const req = required.has(pName) ? ' (required)' : ''
        lines.push(`  <${pName}>${req} — ${pInfo.description || ''}`)
        if (required.has(pName)) {
          example.push(`  <${pName}>...</${pName}>`)
        }
      }
      example.push(`</${tool.name}>`)
      lines.push('  XML example:')
      lines.push(`  ${example.join('\n  ')}`)
    }

    lines.push('', 'IMPORTANT: Return ONLY ONE tool block per response.', 'Output the XML block without surrounding explanation or markdown fences.')
    return lines.join('\n')
  }
}

export const toolRegistry = new ToolRegistry()
