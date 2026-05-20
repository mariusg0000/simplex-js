import React from 'react'

const defaults = {
  model: 'deepseek-chat',
  apiBase: 'https://api.deepseek.com',
  temperature: 0.7,
  maxTokens: 4096,
  showReasoning: true,
}

export function useSettings() {
  const [values, setValues] = React.useState(defaults)

  React.useEffect(() => {
    window.ipc.invoke('settings:load').then((prefs) => {
      setValues((prev) => ({ ...prev, ...prefs }))
    })
  }, [])

  const save = async (newValues) => {
    setValues(newValues)
    await window.ipc.invoke('settings:save', newValues)
  }

  return { values, save }
}
