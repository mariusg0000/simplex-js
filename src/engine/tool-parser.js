const TOOL_START_RE = /<(\w+)>\s*$/m
const ARG_RE = /<(\w+)>(.*?)<\/\1>/gs
const CDATA_RE = /<!\[CDATA\[(.*?)\]\]>/gs
const RESULT_PREFIX = "<result name='"

function parseArgs(xmlBlock) {
  const unrolled = xmlBlock.replace(CDATA_RE, (_m, p1) => p1)
  const inner = unrolled.trim().replace(/^<\w+[^>]*>([\s\S]*)<\/\w+>$/, '$1')
  if (inner === unrolled.trim()) return {}

  const args = {}
  let match
  ARG_RE.lastIndex = 0
  while ((match = ARG_RE.exec(inner)) !== null) {
    args[match[1]] = (match[2] || '').trim()
  }
  return args
}

function collapseWhitespace(text) {
  return text.trim().replace(/\n{3,}/g, '\n\n')
}

export function extractToolBlocks(text, knownTools = new Set()) {
  const blocks = []
  let pos = 0

  while (pos < text.length) {
    const slice = text.slice(pos)
    const match = TOOL_START_RE.exec(slice)
    if (!match) break

    const tag = match[1]
    const openStart = pos + match.index
    const openEnd = openStart + match[0].length

    if (knownTools.size > 0 && !knownTools.has(tag)) {
      pos = openEnd
      continue
    }

    const closeTag = `</${tag}>`
    const closePos = text.indexOf(closeTag, openEnd)

    if (closePos === -1) {
      const raw = text.slice(openStart) + closeTag
      blocks.push({ name: tag, args: parseArgs(raw), raw })
      break
    }

    const raw = text.slice(openStart, closePos + closeTag.length)
    blocks.push({ name: tag, args: parseArgs(raw), raw })
    pos = closePos + closeTag.length
  }

  return blocks
}

export function stripToolBlocks(text, knownTools = new Set()) {
  if (!text) return ''

  const result = []
  let pos = 0

  while (pos < text.length) {
    const slice = text.slice(pos)
    const match = TOOL_START_RE.exec(slice)
    if (!match) {
      result.push(text.slice(pos))
      break
    }

    const tag = match[1]
    const openStart = pos + match.index
    const openEnd = openStart + match[0].length

    if (knownTools.size > 0 && !knownTools.has(tag)) {
      result.push(text.slice(pos, openEnd))
      pos = openEnd
      continue
    }

    const closeTag = `</${tag}>`
    const closePos = text.indexOf(closeTag, openEnd)
    if (closePos === -1) {
      result.push(text.slice(pos))
      break
    }

    result.push(text.slice(pos, openStart))
    pos = closePos + closeTag.length
  }

  return collapseWhitespace(result.join(''))
}

export class StreamingToolParser {
  constructor(knownTools = new Set()) {
    this.knownTools = knownTools
    this._state = 'normal'
    this._buf = ''
    this._display = ''
    this._tools = []
    this._toolName = null
  }

  *feed(chunk) {
    for (const c of chunk) {
      if (this._state === 'normal') {
        if (c === '<') {
          this._state = 'maybe'
          this._buf = '<'
        } else {
          this._display += c
        }
      } else if (this._state === 'maybe') {
        const potential = this._buf + c
        const candidates = this.knownTools.size > 0 ? [...this.knownTools] : []
        const matched = candidates.some((t) => `<${t}`.startsWith(potential))
        const isComplete = candidates.some((t) => potential === `<${t}>`)

        if (isComplete) {
          this._toolName = potential.slice(1, -1)
          this._state = 'intool'
          this._buf = ''
        } else if (!matched) {
          this._display += this._buf
          this._buf = ''
          this._state = 'normal'
          if (c === '<') {
            this._state = 'maybe'
            this._buf = '<'
          } else {
            this._display += c
          }
        } else {
          this._buf = potential
        }
      } else if (this._state === 'intool') {
        this._buf += c
        const closeTag = `</${this._toolName}>`
        if (this._buf.endsWith(closeTag)) {
          const raw = `<${this._toolName}>${this._buf}`
          this._tools.push({ name: this._toolName, args: parseArgs(raw), raw })
          this._buf = ''
          this._toolName = null
          this._state = 'normal'
        }
      }
    }

    if (this._display) {
      yield { type: 'content', content: this._display }
      this._display = ''
    }
  }

  *flush() {
    if (this._state === 'maybe') {
      this._display += this._buf
    } else if (this._state === 'intool') {
      const raw = `<${this._toolName}>${this._buf}</${this._toolName}>`
      const args = parseArgs(raw)
      if (Object.keys(args).length > 0) {
        this._tools.push({ name: this._toolName, args, raw })
      } else {
        this._display += `<${this._toolName}>${this._buf}`
      }
    }

    this._state = 'normal'
    this._buf = ''
    this._toolName = null

    if (this._display) {
      yield { type: 'content', content: this._display }
      this._display = ''
    }
  }

  get toolBlocks() {
    return this._tools
  }

  extractBlocks() {
    return this._tools
  }

  reset() {
    this._state = 'normal'
    this._buf = ''
    this._display = ''
    this._tools = []
    this._toolName = null
  }
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function formatResult(name, resultText) {
  return `<result name='${name}'>${escapeXml(resultText)}</result>`
}

export function formatDisplayForActivityLog(name, args, result) {
  return `[Tool: ${name}]
Args: ${JSON.stringify(args)}
Result: ${typeof result === 'string' ? result : JSON.stringify(result)}`
}

export function isResultMessage(content) {
  return Boolean(content && content.trim().startsWith(RESULT_PREFIX))
}
