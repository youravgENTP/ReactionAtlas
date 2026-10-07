import { useEffect, useState } from 'react'
import { api } from './api'
import { useLatex } from './latex'
import type { BackupStatus, LatexShortcut } from './types'

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
  : 'No backup yet'

const formatBytes = (value: number | null) => {
  if (value === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value; let unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function Settings() {
  const [rows, setRows] = useState<LatexShortcut[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [backup, setBackup] = useState<BackupStatus | null>(null)
  const [backupError, setBackupError] = useState('')
  const [backingUp, setBackingUp] = useState(false)
  const [backupSaved, setBackupSaved] = useState('')
  const { reload } = useLatex()
  useEffect(() => { void api.latexShortcuts().then(setRows).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load settings')) }, [])
  useEffect(() => { void api.backupStatus().then(setBackup).catch((cause) => setBackupError(cause instanceof Error ? cause.message : 'Could not load backup status')) }, [])
  const patch = (id: string, value: Partial<LatexShortcut>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...value } : row))
  const save = async () => {
    setError(''); setSaved(false)
    try { const next = await api.saveLatexShortcuts(rows.filter((row) => row.command.trim() && row.replacement)); setRows(next); await reload(); setSaved(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save settings') }
  }
  const runBackup = async () => {
    setBackingUp(true); setBackupError(''); setBackupSaved('')
    try {
      const next = await api.createBackup(); setBackup(next)
      setBackupSaved(`${next.created_filename ?? next.latest_filename} created.`)
    } catch (cause) { setBackupError(cause instanceof Error ? cause.message : 'Could not create backup') }
    finally { setBackingUp(false) }
  }
  return <div className="settings-page"><div className="settings-header"><div><span className="eyebrow">Preferences</span><h1>Settings</h1><p>Manage writing behavior shared by reaction forms and collection documents.</p></div><button onClick={() => void save()}>Save changes</button></div>
    {error && <div className="error">{error}</div>}{saved && <div className="success">Settings saved.</div>}
    <section className="settings-card"><h2>LaTeX shortcuts</h2><p>Type <code>\command</code> or <code>₩command</code>. It converts when you enter punctuation or whitespace, press Enter, or leave the field.</p><div className="script-help"><strong>Subscript and superscript</strong><span><code>_&#123;text&#125;</code> → <sub>text</sub></span><span><code>_x</code> → <sub>x</sub></span><span><code>^&#123;text&#125;</code> → <sup>text</sup></span><span><code>^x</code> → <sup>x</sup></span><small><code>\_</code> and <code>₩_</code> are also accepted.</small></div>
      <div className="shortcut-table"><div className="shortcut-head"><span>Command</span><span>Replacement</span><span /></div>{rows.map((row) => <div className="shortcut-row" key={row.id}><label><span>\</span><input aria-label="LaTeX command" value={row.command} onChange={(e) => patch(row.id, { command: e.target.value.replace(/^[\\₩]+/, '') })} /></label><input aria-label="Replacement" value={row.replacement} onChange={(e) => patch(row.id, { replacement: e.target.value })} /><button className="icon-button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>×</button></div>)}</div>
      <button className="secondary add-shortcut" onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), command: '', replacement: '' }])}>+ Add shortcut</button>
    </section>
    <section className="settings-card backup-card"><div className="backup-card-heading"><div><h2>Backups</h2><p>The database, uploaded images, and canonical reaction data are saved to a ZIP every {backup?.interval_hours ?? 12} hours.</p></div><button className="secondary" disabled={backingUp} onClick={() => void runBackup()}>{backingUp ? 'Backing up…' : 'Back up now'}</button></div>
      {backupError && <div className="error">{backupError}</div>}{backupSaved && <div className="success backup-success">{backupSaved}</div>}
      <dl className="backup-status"><div><dt>Latest backup</dt><dd>{backup?.latest_filename ?? 'None'}</dd></div><div><dt>Created</dt><dd>{formatDate(backup?.latest_created_at ?? null)}</dd></div><div><dt>Size</dt><dd>{formatBytes(backup?.latest_size_bytes ?? null)}</dd></div><div><dt>Next scheduled</dt><dd>{backup ? formatDate(backup.next_due_at) : 'Loading…'}</dd></div><div className="backup-location"><dt>Location</dt><dd><code>{backup?.directory ?? 'Loading…'}</code></dd></div></dl>
    </section>
  </div>
}
