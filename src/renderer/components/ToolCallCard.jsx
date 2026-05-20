import React from 'react'
import { Terminal } from 'lucide-react'

export function ToolCallCard({ name, args, result }) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="tool-call-card">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <Terminal size={14} />
        <span>{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>
      <div className={`tool-call-body ${expanded ? 'visible' : ''}`}>
        {args && <div><strong>Args:</strong> <pre>{JSON.stringify(args, null, 2)}</pre></div>}
        {result && <div><strong>Result:</strong> <pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre></div>}
      </div>
    </div>
  )
}
