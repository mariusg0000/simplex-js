import React from 'react'
import { X } from 'lucide-react'

export function Settings({ settings, onSave, onClose }) {
  const [form, setForm] = React.useState({ ...settings })

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    onSave(form)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Model</label>
            <input
              value={form.model || ''}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="e.g. deepseek-chat"
            />
          </div>
          <div className="form-group">
            <label>API Base URL</label>
            <input
              value={form.apiBase || ''}
              onChange={(e) => handleChange('apiBase', e.target.value)}
              placeholder="e.g. https://api.deepseek.com"
            />
          </div>
          <div className="form-group">
            <label>Temperature</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={form.temperature || 0.7}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Max Tokens</label>
            <input
              type="number"
              min="1"
              max="128000"
              value={form.maxTokens || 4096}
              onChange={(e) => handleChange('maxTokens', parseInt(e.target.value, 10))}
            />
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={form.showReasoning !== false}
                onChange={(e) => handleChange('showReasoning', e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Show reasoning/thinking
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
