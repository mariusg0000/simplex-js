/**
 * system-prompt.js — src/main/system-prompt.js
 * Builds the dynamic system prompt used by the main chat agent.
 * Layer: Main Process / Dependencies: config, CLI prompt helpers, registries.
 */
import { config } from './config.js'

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
  let content = config.systemPrompt

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

  content += '\n\nSTRATEGIC GUIDELINES:\n1. Use the most direct tool for the user request.\n2. Return exactly one tool XML block when a tool is needed.\n3. Follow each tool schema exactly; do not invent parameters.\n4. If a tool returns an error, fix the call and retry with the same tool when appropriate.\n5. Delegate to an agent only when the request clearly matches an AVAILABLE AGENT task.\n6. For scanned images and layouts, use `use_vision(image_path, request)`.'

  return { role: 'system', content }
}
