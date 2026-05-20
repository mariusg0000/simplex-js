import fs from 'fs'
import path from 'path'
import { config } from '../main/config.js'

const experienceDir = path.join(config.simplexHome, 'experience')

export const learning = {
  save(key, content) {
    if (!fs.existsSync(experienceDir)) fs.mkdirSync(experienceDir, { recursive: true })
    const filePath = path.join(experienceDir, `${key}.md`)
    fs.writeFileSync(filePath, content, 'utf-8')
  },

  load(key) {
    const filePath = path.join(experienceDir, `${key}.md`)
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  },

  list() {
    if (!fs.existsSync(experienceDir)) return []
    return fs.readdirSync(experienceDir).filter((f) => f.endsWith('.md'))
  },

  delete(key) {
    const filePath = path.join(experienceDir, `${key}.md`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  },
}
