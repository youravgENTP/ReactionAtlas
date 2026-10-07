import { useEffect, useState } from 'react'
import { api } from './api'
import { useLatex } from './latex'
import type { LatexShortcut } from './types'

export function Settings() {
  const [rows, setRows] = useState<LatexShortcut[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const { reload } = useLatex()
  useEffect(() => { void api.latexShortcuts().then(setRows).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load settings')) }, [])
  const patch = (id: string, value: Partial<LatexShortcut>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...value } : row))
  const save = async () => {
    setError(''); setSaved(false)
    try { const next = await api.saveLatexShortcuts(rows.filter((row) => row.command.trim() && row.replacement)); setRows(next); await reload(); setSaved(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save settings') }
  }
  return <div className="settings-page"><div className="settings-header"><div><span className="eyebrow">Preferences</span><h1>Settings</h1><p>Manage writing behavior shared by reaction forms and collection documents.</p></div><button onClick={() => void save()}>Save changes</button></div>
    {error && <div className="error">{error}</div>}{saved && <div className="success">Settings saved.</div>}
    <section className="settings-card"><h2>LaTeX shortcuts</h2><p>Type <code>\command</code> or <code>₩command</code>. It converts when you enter punctuation or whitespace, press Enter, or leave the field.</p><div className="script-help"><strong>Subscript and superscript</strong><span><code>_&#123;text&#125;</code> → <sub>text</sub></span><span><code>_x</code> → <sub>x</sub></span><span><code>^&#123;text&#125;</code> → <sup>text</sup></span><span><code>^x</code> → <sup>x</sup></span><small><code>\_</code> and <code>₩_</code> are also accepted.</small></div>
      <div className="shortcut-table"><div className="shortcut-head"><span>Command</span><span>Replacement</span><span /></div>{rows.map((row) => <div className="shortcut-row" key={row.id}><label><span>\</span><input aria-label="LaTeX command" value={row.command} onChange={(e) => patch(row.id, { command: e.target.value.replace(/^[\\₩]+/, '') })} /></label><input aria-label="Replacement" value={row.replacement} onChange={(e) => patch(row.id, { replacement: e.target.value })} /><button className="icon-button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>×</button></div>)}</div>
      <button className="secondary add-shortcut" onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), command: '', replacement: '' }])}>+ Add shortcut</button>
    </section>
  </div>
}
