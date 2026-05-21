import dotenv from 'dotenv'
import path from 'path'
import os from 'os'
import fs from 'fs'

const SIMPLEX_HOME = path.join(os.homedir(), '.simplexai')
const CONFIG_PATH = path.join(SIMPLEX_HOME, 'config.json')
const ORIGINAL_ENV_PATH = path.resolve(process.cwd(), '.env')

dotenv.config({ path: ORIGINAL_ENV_PATH, override: true })

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function parseProviders(envVars) {
  const providers = {}
  for (const [key, value] of Object.entries(envVars)) {
    if (!key || !value) continue
    if (key.startsWith('SIMPLEX_PROVIDER_') && key.endsWith('_ALIAS')) {
      const stem = key.slice('SIMPLEX_PROVIDER_'.length, -'_ALIAS'.length)
      const apiKey = envVars[`SIMPLEX_PROVIDER_${stem}_API_KEY`] || ''
      const apiBase = envVars[`SIMPLEX_PROVIDER_${stem}_API_BASE`] || ''
      if (apiKey) {
        providers[value] = { apiKey, apiBase }
      }
    }
  }
  return providers
}

let envVars = { ...process.env }

if (fs.existsSync(ORIGINAL_ENV_PATH)) {
  const parsed = dotenv.parse(fs.readFileSync(ORIGINAL_ENV_PATH, 'utf-8'))
  envVars = { ...envVars, ...parsed }
}

const providers = parseProviders(envVars)

function resolveModel(modelStr) {
  modelStr = modelStr || envVars.SIMPLEX_CHAT_MODEL || envVars.SIMPLEX_MODEL || 'opencode-go/deepseek-v4-flash'
  if (modelStr.includes('/')) {
    const slashIdx = modelStr.indexOf('/')
    const alias = modelStr.slice(0, slashIdx)
    const rest = modelStr.slice(slashIdx + 1)
    if (providers[alias]) {
      return {
        model: rest,
        apiKey: providers[alias].apiKey,
        apiBase: providers[alias].apiBase,
      }
    }
  }
  return {
    model: modelStr,
    apiKey: envVars.SIMPLEX_OPENAI_API_KEY || '',
    apiBase: envVars.SIMPLEX_OPENAI_API_BASE || '',
  }
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function saveConfig(partial) {
  ensureDir(CONFIG_PATH)
  const existing = loadConfig() || {}
  const merged = { ...existing, ...partial }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')

  // Dynamically update the active config export object properties in-memory
  if (partial.chatModel !== undefined) {
    config.chatModel = partial.chatModel
    config.chatModelResolved = resolveModel(partial.chatModel)
  }
  if (partial.visionModel !== undefined) {
    config.visionModel = partial.visionModel
    config.visionModelResolved = resolveModel(partial.visionModel)
  }
  if (partial.summarizationModel !== undefined) {
    config.summarizationModel = partial.summarizationModel
    config.summarizationModelResolved = resolveModel(partial.summarizationModel)
  }
  if (partial.temperature !== undefined) config.temperature = partial.temperature
  if (partial.maxTokens !== undefined) config.maxTokens = partial.maxTokens
  if (partial.systemPrompt !== undefined) config.systemPrompt = partial.systemPrompt
  if (partial.theme !== undefined) config.theme = partial.theme

  return merged
}

async function fetchModelsForProvider(alias) {
  const target = providers[alias]
  if (!target || !target.apiBase || !target.apiKey) return []

  try {
    const url = target.apiBase.endsWith('/') ? `${target.apiBase}models` : `${target.apiBase}/models`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${target.apiKey}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    const models = Array.isArray(data) ? data : (data.data || [])
    return models.map((m) => m.id)
  } catch {
    return []
  }
}

function getProviderList() {
  return Object.keys(providers)
}

const savedConfig = loadConfig() || {}
const defaultChatModel = envVars.SIMPLEX_CHAT_MODEL || envVars.SIMPLEX_MODEL || 'opencode-go/deepseek-v4-flash'
const defaultVisionModel = envVars.SIMPLEX_VISION_MODEL || ''

const chatModelStr = savedConfig.chatModel || defaultChatModel
const visionModelStr = savedConfig.visionModel || defaultVisionModel
const summarizationModelStr = savedConfig.summarizationModel || defaultChatModel
const themeStr = savedConfig.theme || envVars.SIMPLEX_THEME || 'dark'

const resolvedChat = resolveModel(chatModelStr)
const resolvedVision = resolveModel(visionModelStr)
const resolvedSummarization = resolveModel(summarizationModelStr)

export const config = {
  chatModel: chatModelStr,
  chatModelResolved: resolvedChat,
  visionModel: visionModelStr,
  visionModelResolved: resolvedVision,
  summarizationModel: summarizationModelStr,
  summarizationModelResolved: resolvedSummarization,
  temperature: savedConfig.temperature ?? parseFloat(envVars.SIMPLEX_TEMPERATURE || envVars.TEMPERATURE || '0.7'),
  maxTokens: savedConfig.maxTokens ?? parseInt(envVars.SIMPLEX_MAX_TOKENS || envVars.MAX_TOKENS || '4096', 10),
  maxContext: parseInt(envVars.SIMPLEX_MAX_CONTEXT || '80000', 10),
  minContext: parseInt(envVars.SIMPLEX_MIN_CONTEXT || '4000', 10),
  systemPrompt: savedConfig.systemPrompt ?? envVars.SIMPLEX_SYSTEM_PROMPT ?? 'You are Simplex AI, a helpful office assistant.',
  theme: themeStr,
  logLevel: envVars.SIMPLEX_LOG_LEVEL || envVars.LOG_LEVEL || 'INFO',
  nativeMode: envVars.SIMPLEX_NATIVE_MODE === 'True' || envVars.SIMPLEX_NATIVE_MODE === 'true',
  simplexHome: SIMPLEX_HOME,
  dbPath: path.join(SIMPLEX_HOME, 'chats.db'),
  settingsPath: path.join(SIMPLEX_HOME, 'user_settings.json'),
  configPath: CONFIG_PATH,
  bridgePath: path.join(SIMPLEX_HOME, 'bridge.py'),
  pythonPath: path.join(SIMPLEX_HOME, '.venv', 'bin', 'python'),
  providers,
  getProviderList,
  fetchModelsForProvider,
  resolveModel,
  loadConfig,
  saveConfig,
}
