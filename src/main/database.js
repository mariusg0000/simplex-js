import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { config } from './config.js'

const SESSIONS_DIR = path.join(config.simplexHome, 'sessions')

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function sessionDir(id) {
  return path.join(SESSIONS_DIR, id)
}

function ensureSessionFolder(id) {
  const dir = sessionDir(id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

const dbPath = config.dbPath
ensureDir(dbPath)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    messages TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    archived INTEGER NOT NULL DEFAULT 0
  )
`)

const insertStmt = db.prepare(
  'INSERT INTO sessions (id, title, messages) VALUES (?, ?, ?)'
)
const updateStmt = db.prepare(
  'UPDATE sessions SET title = ?, messages = ?, updated_at = unixepoch() WHERE id = ?'
)
const getStmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
const listStmt = db.prepare(
  'SELECT id, title, created_at, updated_at, archived FROM sessions ORDER BY updated_at DESC'
)
const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?')
const archiveStmt = db.prepare(
  'UPDATE sessions SET archived = 1, updated_at = unixepoch() WHERE id = ?'
)

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export const database = {
  createSession(title, messages = []) {
    const id = generateId()
    ensureSessionFolder(id)
    insertStmt.run(id, title, JSON.stringify(messages))
    return id
  },

  updateSession(id, title, messages) {
    updateStmt.run(title, JSON.stringify(messages), id)
  },

  getSession(id) {
    const row = getStmt.get(id)
    if (!row) return null
    ensureSessionFolder(id)
    return {
      ...row,
      messages: JSON.parse(row.messages),
    }
  },

  listSessions(includeArchived = false) {
    if (includeArchived) return listStmt.all()
    return listStmt.all().filter((s) => !s.archived)
  },

  deleteSession(id) {
    deleteStmt.run(id)
    const dir = sessionDir(id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  },

  archiveSession(id) {
    archiveStmt.run(id)
  },

  sessionDir,
}
