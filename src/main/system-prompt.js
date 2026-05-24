/**
 * system-prompt.js — src/main/system-prompt.js
 * Builds the dynamic system prompt used by the main chat agent.
 * Layer: Main Process / Dependencies: config, CLI prompt helpers, registries.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { config } from './config.js'
import { CLI_PROMPTS, EXCLUDED_CLI, TOOL_ALIASES } from './prompts.js'

let envCache = null

export function buildToolsSection(tools) {
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

function findTool(cmd) {
  for (const name of [cmd, ...(TOOL_ALIASES[cmd] || [])]) {
    try {
      const result = execSync(`which "${name}" 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim()
      if (result) return result
    } catch {
      // ignore lookup failures
    }
  }
  return null
}

function pythonPackageAvailable(pkg) {
  const scriptsVenv = path.join(config.simplexHome, 'scripts', '.venv', 'bin', 'python')
  const python = fs.existsSync(scriptsVenv) ? scriptsVenv : 'python3'
  try {
    execSync(`"${python}" -c "import ${pkg}"`, { encoding: 'utf-8', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function buildEnvSection() {
  if (envCache !== null) return envCache

  const lines = []
  for (const [cmd, prompt] of Object.entries(CLI_PROMPTS)) {
    if (EXCLUDED_CLI.has(cmd)) continue
    if (cmd === 'pandas') {
      if (pythonPackageAvailable('pandas')) lines.push(prompt)
    } else if (findTool(cmd)) {
      lines.push(prompt)
    }
  }

  envCache = lines.join('\n')
  return envCache
}

function buildSkillsSection(skills) {
  if (!skills || skills.length === 0) return ''
  const lines = ['AVAILABLE SKILLS:']
  for (const s of skills) {
    lines.push(`- ${s.name}: ${(s.description || '').trim()}`)
  }
  return lines.join('\n')
}

function buildActiveSkillsDetails(activeSkills) {
  if (!activeSkills || activeSkills.length === 0) return ''
  const lines = ['ACTIVE SKILLS DETAILS:']
  for (const s of activeSkills) {
    lines.push(`### ${s.name}`)
    lines.push(s.skillPrompt || '')
  }
  return lines.join('\n')
}

export function buildSystemPrompt(tools, agents, skills, sessionFolder, activeSkills = []) {
  const envSection = buildEnvSection()
  let content = config.systemPrompt

  if (envSection) {
    content += '\n\nSYSTEM ENVIRONMENT:\n' + envSection
  }

  if (agents.length > 0) {
    const descs = agents.map(a => `- **${a.name}**: ${(a.rolePrompt || '').slice(0, 100)}`).join('\n')
    content += '\n\nAVAILABLE AGENTS:\n' + descs
  }

  const skillsSection = buildSkillsSection(skills)
  if (skillsSection) {
    content += `\n\n${skillsSection}`
  }

  const activeSkillsSection = buildActiveSkillsDetails(activeSkills)
  if (activeSkillsSection) {
    content += `\n\n${activeSkillsSection}`
  }

  if (tools.length > 0) {
    content += '\n\n' + buildToolsSection(tools)
  }

  const now = new Date()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.getHours()}:00 (${monthNames[now.getMonth()]}, ${dayNames[now.getDay()]})`

  content += `\n\nCWD: ${process.cwd()}\nCurrent time: ${timeStr}\n\nWorking directory: ${config.simplexHome}\n  - .tmp/     -> temporary/intermediate files (auto-cleaned after 30 min)\n  - scripts/  -> reusable Python scripts (see catalog below)`

  if (sessionFolder) {
    content += `\n  - sessions/ -> current session workspace\n                 ${sessionFolder}/\n    All temporary files (content, scripts, generated documents) for this chat go here.\n    Sub-agents work ONLY inside this folder.`
  }

  content += '\n\nSTRATEGIC GUIDELINES:\n1. BE EFFICIENT: Do not perform more than 2 search attempts for the same request.\n2. TRUST THE TOOLS: If a search tool returns results, those are the best matches. Present them immediately.\n3. NO REDUNDANCY: Do not call the same tool with slightly different parameters if you already have relevant data.\n4. RERANKER TRUST: The file search tool uses an internal Reranker. The top results it returns are the final candidates.\n5. DELEGATE TO AGENTS: When a task matches an AVAILABLE AGENT description, delegate it.\n  For `create_doc`: describe the task in natural language in `task`. Mention the content filenames in the task text:\n     create_doc(task="Create invoice from scan.abc123.md. Layout: modern, Calibri 11pt")\n  Content files (written by use_vision, user upload, or write_file) are in the session folder.\n  If content files from use_vision already exist in the session folder, mention their names in the task.\n  CRITICAL: NEVER read a file just to pass its content inline. Put content in session folder files, mention filenames in `task`, keep `task` brief.\n6. TRUST SUB-AGENT VERIFICATION: Sub-agents verify their own output before reporting success. Do NOT inspect sub-agent output in any way — no read_file, no bash ls, no file size check. If the sub-agent says \'verified OK\', it IS verified OK. Only inspect if the user explicitly asks you to, or if the sub-agent reports an error. Use read_file/read_document ONLY when you genuinely need to understand file content yourself.\n7. IMAGE ANALYSIS (scanned docs, tables, layouts): Use `use_vision(image_path, request)` directly for all image processing — vision handles text extraction, layout, tables, handwriting, and poor-quality scans in a single pass. Do NOT use tesseract/pytesseract OCR — vision is more reliable.'

  return { role: 'system', content }
}
