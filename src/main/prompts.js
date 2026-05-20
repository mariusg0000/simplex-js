import fs from 'fs'
import toml from '@iarna/toml'
import path from 'path'
import { config } from './config.js'

export function loadPrompts() {
  const promptsPath = path.join(config.simplexHome, 'cli_prompts.toml')
  if (!fs.existsSync(promptsPath)) return {}
  const raw = fs.readFileSync(promptsPath, 'utf-8')
  return toml.parse(raw)
}
