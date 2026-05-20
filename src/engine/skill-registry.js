import fs from 'fs'
import path from 'path'
import { config } from '../main/config.js'
import { inspectTool } from './python-bridge.js'

export class SkillRegistry {
  constructor() {
    this.skills = new Map()
  }

  async discover() {
    const skillDirs = [
      path.join(config.simplexHome, 'skills'),
      path.join(process.cwd(), 'skills'),
    ]

    for (const dir of skillDirs) {
      if (!fs.existsSync(dir)) continue
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.py'))
      for (const file of files) {
        try {
          const schema = await inspectTool(path.join(dir, file))
          this.skills.set(schema.name, { ...schema, path: path.join(dir, file) })
        } catch {
          // skip
        }
      }
    }
  }

  get(name) {
    return this.skills.get(name)
  }

  list() {
    return Array.from(this.skills.values())
  }
}
