import React from 'react'

export function StatusBar({ tokens, cost, status }) {
  return (
    <div className="status-bar">
      <span>{status || 'Ready'}</span>
      <span>
        {tokens !== undefined && `Tokens: ${tokens}`}
        {tokens !== undefined && cost !== undefined && ' | '}
        {cost !== undefined && `Cost: $${cost.toFixed(6)}`}
      </span>
    </div>
  )
}
