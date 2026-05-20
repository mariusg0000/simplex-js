import React from 'react'

const defaults = {
  chatModel: 'opencode-go/deepseek-v4-flash',
  visionModel: '',
  summarizationModel: 'opencode-go/deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: 4096,
  maxContext: 80000,
  minContext: 4000,
  systemPrompt: 'You are Simplex AI, a helpful office assistant.',
  showReasoning: true,
}

export function useSettings() {
  const [values, setValues] = React.useState(defaults)
  const [providers, setProviders] = React.useState([])
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    Promise.all([
      window.ipc.invoke('config:load'),
      window.ipc.invoke('providers:list'),
    ]).then(([cfg, provs]) => {
      setValues((prev) => ({ ...prev, ...cfg }))
      setProviders(provs)
      setLoaded(true)
    })
  }, [])

  const save = async (newValues) => {
    setValues(newValues)
    await window.ipc.invoke('config:save', newValues)
  }

  const fetchModels = async (providerAlias) => {
    if (!providerAlias) return []
    return window.ipc.invoke('models:list', providerAlias)
  }

  return { values, save, providers, loaded, fetchModels }
}
