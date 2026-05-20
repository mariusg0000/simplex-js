import React from 'react'

export function ReasoningBlock({ content }) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="reasoning-block">
      <button className="reasoning-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾' : '▸'} Thinking
      </button>
      <div className={`reasoning-content ${expanded ? 'visible' : ''}`}>
        {content}
      </div>
    </div>
  )
}
