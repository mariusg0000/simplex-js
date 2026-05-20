const TOOL_BLOCK_RE = /<(\w+)>([\s\S]*?)<\/\1>/g

export class StreamingToolParser {
  constructor() {
    this.buffer = ''
    this.partialBlocks = []
  }

  feed(chunk) {
    this.buffer += chunk
    const blocks = this.extractBlocks()
    return blocks
  }

  extractBlocks() {
    const blocks = []
    const regex = new RegExp(TOOL_BLOCK_RE)
    let match
    while ((match = regex.exec(this.buffer)) !== null) {
      blocks.push({ name: match[1], content: match[2].trim() })
    }
    return blocks
  }

  stripToolBlocks(text) {
    return text.replace(TOOL_BLOCK_RE, '').trim()
  }

  reset() {
    this.buffer = ''
    this.partialBlocks = []
  }
}

export function extractToolBlocks(text) {
  const blocks = []
  const regex = new RegExp(TOOL_BLOCK_RE)
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ name: match[1], content: match[2].trim() })
  }
  return blocks
}

export function stripToolBlocks(text) {
  return text.replace(TOOL_BLOCK_RE, '').trim()
}

export function formatResult(name, args, result) {
  return `<${name}_result>
${JSON.stringify(result, null, 2)}
</${name}_result>`
}

export function formatDisplayForActivityLog(name, args, result) {
  return `[Tool: ${name}]
Args: ${JSON.stringify(args)}
Result: ${typeof result === 'string' ? result : JSON.stringify(result)}`
}
