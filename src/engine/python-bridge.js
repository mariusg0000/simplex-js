import { spawnSync } from 'child_process'
import { config } from '../main/config.js'

export function inspectTool(toolPath) {
  const result = spawnSync(config.pythonPath, [config.bridgePath, 'inspect', toolPath], {
    timeout: 10000,
    encoding: 'utf-8',
  })
  if (result.error) throw new Error(`Bridge inspect failed: ${result.error.message}`)
  return JSON.parse(result.stdout)
}

export function executeTool(toolPath, args) {
  const result = spawnSync(
    config.pythonPath,
    [config.bridgePath, 'execute', toolPath, JSON.stringify(args)],
    { timeout: 30000, encoding: 'utf-8' }
  )
  if (result.error) throw new Error(`Bridge execute failed: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(
      `Bridge execute non-zero exit\n` +
      `toolPath: ${toolPath}\n` +
      `status: ${result.status}\n` +
      `stdout:\n${result.stdout || ''}\n` +
      `stderr:\n${result.stderr || ''}`
    )
  }
  try {
    return JSON.parse(result.stdout)
  } catch (err) {
    throw new Error(
      `Bridge execute JSON parse failed\n` +
      `toolPath: ${toolPath}\n` +
      `stdout:\n${result.stdout || ''}\n` +
      `stderr:\n${result.stderr || ''}\n` +
      `cause: ${err?.message || String(err)}`
    )
  }
}
