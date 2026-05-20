import fs from 'fs'
import path from 'path'
import { config } from './config.js'

const defaults = {
  workingDirectories: [],
  showReasoning: true,
}

export const storage = {
  load() {
    try {
      if (!fs.existsSync(config.settingsPath)) return { ...defaults }
      const data = fs.readFileSync(config.settingsPath, 'utf-8')
      return { ...defaults, ...JSON.parse(data) }
    } catch {
      return { ...defaults }
    }
  },

  save(prefs) {
    const dir = path.dirname(config.settingsPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(config.settingsPath, JSON.stringify(prefs, null, 2), 'utf-8')
  },
}
