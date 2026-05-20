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
}
