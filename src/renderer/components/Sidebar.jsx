import React from 'react'
import { Plus, Settings as SettingsIcon, Trash2, Edit3 } from 'lucide-react'

export function Sidebar({ sessions, currentId, onSelect, onNew, onDelete, onRename, onSettings }) {
  const [editingId, setEditingId] = React.useState(null)
  const [editTitle, setEditTitle] = React.useState('')

  const handleStartRename = (id, title) => {
    setEditingId(id)
    setEditTitle(title)
  }

  const handleFinishRename = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim())
    }
    setEditingId(null)
    setEditTitle('')
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Simplex</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-icon" onClick={onNew} title="New session">
            <Plus size={18} />
          </button>
          <button className="btn-icon" onClick={onSettings} title="Settings">
            <SettingsIcon size={18} />
          </button>
        </div>
      </div>
      <div className="sidebar-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.id === currentId ? 'active' : ''}`}
            onClick={() => onSelect(session.id)}
          >
            {editingId === session.id ? (
              <input
                className="session-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  padding: '2px 6px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            ) : (
              <span className="session-title">
                {session.title || 'New Chat'}
              </span>
            )}
            <div className="session-actions">
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); handleStartRename(session.id, session.title) }}
                title="Rename"
              >
                <Edit3 size={14} />
              </button>
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); onDelete(session.id) }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
