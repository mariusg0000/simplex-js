import React from 'react'

export function ModelSelector({ label, providers, selectedProvider, selectedModel, fetchModels, onProviderChange, onModelChange }) {
  const [models, setModels] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [inputValue, setInputValue] = React.useState('')
  const [showList, setShowList] = React.useState(false)

  React.useEffect(() => {
    if (!selectedProvider || loaded) return
    loadModels(selectedProvider)
  }, [selectedProvider])

  React.useEffect(() => {
    setInputValue(selectedModel || '')
  }, [selectedModel])

  const loadModels = async (provider) => {
    setLoading(true)
    try {
      const result = await fetchModels(provider)
      setModels(result)
      setLoaded(true)
    } catch {
      setModels([])
    } finally {
      setLoading(false)
    }
  }

  const handleProviderChange = (e) => {
    const provider = e.target.value
    setLoaded(false)
    setModels([])
    onProviderChange(provider)
    if (provider) loadModels(provider)
  }

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
    setShowList(true)
    onModelChange(val)
  }

  const handleSelectModel = (model) => {
    setInputValue(model)
    setShowList(false)
    onModelChange(model)
  }

  const handleInputFocus = () => {
    setShowList(true)
  }

  const handleInputBlur = (e) => {
    if (e.relatedTarget && e.relatedTarget.closest('.model-combo-list')) return
    setTimeout(() => setShowList(false), 200)
  }

  const handleListMouseDown = (e) => {
    e.preventDefault()
  }

  const filteredModels = inputValue
    ? models.filter((m) => m.toLowerCase().includes(inputValue.toLowerCase()))
    : models

  return (
    <div className="model-selector">
      <label>{label}</label>
      <div className="model-selector-row">
        <select value={selectedProvider} onChange={handleProviderChange}>
          <option value="">-- Provider --</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {loading && <span className="text-muted">Loading...</span>}
      </div>
      {models.length > 0 && (
        <div className="model-combo-wrapper">
          <input
            type="text"
            placeholder="Select or type model..."
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className="model-combo-input"
          />
          {showList && filteredModels.length > 0 && (
            <ul className="model-combo-list" onMouseDown={handleListMouseDown}>
              {filteredModels.slice(0, 50).map((m) => (
                <li
                  key={m}
                  className={`model-combo-item ${m === selectedModel ? 'active' : ''}`}
                  onMouseDown={() => handleSelectModel(m)}
                >
                  {m}
                </li>
              ))}
              {filteredModels.length > 50 && (
                <li className="model-combo-item disabled">
                  ... and {filteredModels.length - 50} more (type to refine)
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
