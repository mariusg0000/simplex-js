import dotenv from 'dotenv'
import path from 'path'
import os from 'os'
import fs from 'fs'

const SIMPLEX_HOME = path.join(os.homedir(), '.simplexai')

const ORIGINAL_ENV_PATH = path.resolve(process.cwd(), '../Simplex/.env')

dotenv.config({ path: ORIGINAL_ENV_PATH, override: true })

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

const resolved = resolveModel()

async function fetchModels() {
  const results = []
  const allProviders = { ...providers }

  if (envVars.SIMPLEX_OPENAI_API_KEY) {
    const fallbackAlias = 'default'
    allProviders[fallbackAlias] = {
      apiKey: envVars.SIMPLEX_OPENAI_API_KEY,
      apiBase: envVars.SIMPLEX_OPENAI_API_BASE || '',
    }
  }

  for (const [alias, { apiKey, apiBase }] of Object.entries(allProviders)) {
    if (!apiBase || !apiKey) continue
    try {
      const url = apiBase.endsWith('/') ? `${apiBase}models` : `${apiBase}/models`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) continue
      const data = await res.json()
      const models = Array.isArray(data) ? data : (data.data || [])
      for (const m of models) {
        results.push({
          id: m.id,
          provider: alias,
          fullName: `${alias}/${m.id}`,
        })
      }
    } catch {
      // skip unreachable providers
    }
  }
  return results
}

export const config = {
  model: resolved.model,
  apiKey: resolved.apiKey,
  apiBase: resolved.apiBase,
  chatModel: envVars.SIMPLEX_CHAT_MODEL || envVars.SIMPLEX_MODEL || 'opencode-go/deepseek-v4-flash',
  visionModel: envVars.SIMPLEX_VISION_MODEL || '',
  temperature: parseFloat(envVars.SIMPLEX_TEMPERATURE || envVars.TEMPERATURE || '0.7'),
  maxTokens: parseInt(envVars.SIMPLEX_MAX_TOKENS || envVars.MAX_TOKENS || '4096', 10),
  maxContext: parseInt(envVars.SIMPLEX_MAX_CONTEXT || '80000', 10),
  minContext: parseInt(envVars.SIMPLEX_MIN_CONTEXT || '4000', 10),
  systemPrompt: envVars.SIMPLEX_SYSTEM_PROMPT || 'You are Simplex AI, a helpful office assistant.',
  logLevel: envVars.SIMPLEX_LOG_LEVEL || envVars.LOG_LEVEL || 'INFO',
  nativeMode: envVars.SIMPLEX_NATIVE_MODE === 'True' || envVars.SIMPLEX_NATIVE_MODE === 'true',
  simplexHome: SIMPLEX_HOME,
  dbPath: path.join(SIMPLEX_HOME, 'chats.db'),
  settingsPath: path.join(SIMPLEX_HOME, 'user_settings.json'),
  bridgePath: path.join(SIMPLEX_HOME, 'bridge.py'),
  pythonPath: path.join(SIMPLEX_HOME, '.venv', 'bin', 'python'),
  providers,
  resolveModel,
  fetchModels,
}

if (!config.apiKey && process.env.API_KEY) {
  config.apiKey = process.env.API_KEY
  config.apiBase = process.env.API_BASE || config.apiBase
  config.model = process.env.MODEL || config.model
}
