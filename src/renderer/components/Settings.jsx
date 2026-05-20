import React from 'react'
import { X } from 'lucide-react'
import { ModelSelector } from './ModelSelector.jsx'

const TABS = ['Models', 'General']

export function Settings({ values, providers, loaded, fetchModels, onSave, onClose }) {
  const [activeTab, setActiveTab] = React.useState('Models')
  const [form, setForm] = React.useState({ ...values })

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    onSave(form)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {activeTab === 'Models' && loaded && (
            <ModelsTab form={form} providers={providers} fetchModels={fetchModels} onChange={handleChange} />
          )}
          {activeTab === 'General' && (
            <GeneralTab form={form} onChange={handleChange} />
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

function ModelsTab({ form, providers, fetchModels, onChange }) {
  return (
    <div className="models-tab">
      <ModelSelector
        label="Chat model"
        providers={providers}
        selectedProvider={form.chatModel?.split('/')[0] || ''}
        selectedModel={form.chatModel?.split('/').slice(1).join('/') || ''}
        fetchModels={fetchModels}
        onProviderChange={(provider) => {
          onChange('chatModel', `${provider}/`)
        }}
        onModelChange={(model) => {
          const provider = form.chatModel?.split('/')[0] || ''
          onChange('chatModel', `${provider}/${model}`)
        }}
      />
      <ModelSelector
        label="Vision model"
        providers={providers}
        selectedProvider={form.visionModel?.split('/')[0] || ''}
        selectedModel={form.visionModel?.split('/').slice(1).join('/') || ''}
        fetchModels={fetchModels}
        onProviderChange={(provider) => {
          onChange('visionModel', `${provider}/`)
        }}
        onModelChange={(model) => {
          const provider = form.visionModel?.split('/')[0] || ''
          onChange('visionModel', `${provider}/${model}`)
        }}
      />
      <ModelSelector
        label="Summarization model"
        providers={providers}
        selectedProvider={form.summarizationModel?.split('/')[0] || ''}
        selectedModel={form.summarizationModel?.split('/').slice(1).join('/') || ''}
        fetchModels={fetchModels}
        onProviderChange={(provider) => {
          onChange('summarizationModel', `${provider}/`)
        }}
        onModelChange={(model) => {
          const provider = form.summarizationModel?.split('/')[0] || ''
          onChange('summarizationModel', `${provider}/${model}`)
        }}
      />
    </div>
  )
}

function GeneralTab({ form, onChange }) {
  return (
    <div className="general-tab">
      <div className="form-group">
        <label>Temperature</label>
        <input
          type="number"
          min="0"
          max="2"
          step="0.1"
          value={form.temperature ?? 0.7}
          onChange={(e) => onChange('temperature', parseFloat(e.target.value))}
        />
      </div>
      <div className="form-group">
        <label>Max Tokens</label>
        <input
          type="number"
          min="1"
          max="128000"
          value={form.maxTokens ?? 4096}
          onChange={(e) => onChange('maxTokens', parseInt(e.target.value, 10))}
        />
      </div>
      <div className="form-group">
        <label>Max Context</label>
        <input
          type="number"
          min="1000"
          max="200000"
          step="1000"
          value={form.maxContext ?? 80000}
          onChange={(e) => onChange('maxContext', parseInt(e.target.value, 10))}
        />
      </div>
      <div className="form-group">
        <label>Min Context</label>
        <input
          type="number"
          min="500"
          max="20000"
          step="500"
          value={form.minContext ?? 4000}
          onChange={(e) => onChange('minContext', parseInt(e.target.value, 10))}
        />
      </div>
      <div className="form-group">
        <label>System Prompt</label>
        <textarea
          rows="4"
          value={form.systemPrompt || ''}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
          placeholder="You are Simplex AI, a helpful office assistant."
        />
      </div>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={form.showReasoning !== false}
            onChange={(e) => onChange('showReasoning', e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Show reasoning/thinking
        </label>
      </div>
    </div>
  )
}
