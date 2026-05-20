import React from 'react'

export function ModelSelector({ label, providers, selectedProvider, selectedModel, fetchModels, onProviderChange, onModelChange }) {
  const [models, setModels] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    if (!selectedProvider || loaded) return
    loadModels(selectedProvider)
  }, [selectedProvider])

  const loadModels = async (provider) => {
    setLoading(true)
    setSearch('')
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

  const filteredModels = search
    ? models.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
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
        <div className="model-search">
          <input
            type="text"
            placeholder="Filter models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="model-search-clear"
              onClick={() => setSearch('')}
              title="Clear filter"
            >
              ×
            </button>
          )}
        </div>
      )}
      {models.length > 0 && (
        <select value={selectedModel} onChange={(e) => onModelChange(e.target.value)}>
          <option value="">-- Model --</option>
          {filteredModels.slice(0, 200).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {filteredModels.length > 200 && (
            <option disabled>... and {filteredModels.length - 200} more (refine filter)</option>
          )}
        </select>
      )}
    </div>
  )
}
