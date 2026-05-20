import React from 'react'

const defaults = {
  model: 'opencode-go/deepseek-v4-flash',
  apiBase: 'https://opencode.ai/zen/go/v1',
  temperature: 0.7,
  maxTokens: 4096,
  showReasoning: true,
}

export function useSettings() {
  const [values, setValues] = React.useState(defaults)
  const [availableModels, setAvailableModels] = React.useState([])
  const [modelsLoading, setModelsLoading] = React.useState(false)

  React.useEffect(() => {
    window.ipc.invoke('settings:load').then((prefs) => {
      setValues((prev) => ({ ...prev, ...prefs }))
    })
    loadModels()
  }, [])

  const loadModels = async () => {
    setModelsLoading(true)
    try {
      const models = await window.ipc.invoke('models:list')
      setAvailableModels(models)
    } catch {
      setAvailableModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  const save = async (newValues) => {
    setValues(newValues)
    await window.ipc.invoke('settings:save', newValues)
  }

  return { values, save, availableModels, modelsLoading, reloadModels: loadModels }
}
