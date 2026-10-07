import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { LatexShortcut } from './types'

const fallback: LatexShortcut[] = [
  ['rightarrow', '→'], ['leftarrow', '←'], ['leftrightarrow', '↔'], ['Rightarrow', '⇒'],
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['theta', 'θ'],
  ['lambda', 'λ'], ['mu', 'μ'], ['pi', 'π'], ['sigma', 'σ'], ['phi', 'φ'], ['omega', 'ω'],
  ['infty', '∞'], ['approx', '≈'], ['neq', '≠'], ['leq', '≤'], ['geq', '≥'],
  ['times', '×'], ['pm', '±'], ['cdot', '·'], ['degree', '°'],
].map(([command, replacement]) => ({ id: `builtin-${command}`, command, replacement }))

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export function applyLatexShortcuts(value: string, shortcuts: LatexShortcut[], includeEnd = false) {
  const names = shortcuts.map((item) => item.command).filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  if (!names) return value
  const replacements = new Map(shortcuts.map((item) => [item.command, item.replacement]))
  const boundary = includeEnd ? '(?=$|[\\s.,;:!?()[\\]{}])' : '(?=[\\s.,;:!?()[\\]{}])'
  return value.replace(new RegExp(`[\\\\₩](${names})${boundary}`, 'g'), (_, command: string) => replacements.get(command) ?? command)
}

interface LatexContextValue {
  shortcuts: LatexShortcut[]
  transform: (value: string, includeEnd?: boolean) => string
  reload: () => Promise<void>
}

const LatexContext = createContext<LatexContextValue>({ shortcuts: fallback, transform: (value) => value, reload: async () => undefined })

export function LatexProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState(fallback)
  const reload = useCallback(async () => { setShortcuts(await api.latexShortcuts()) }, [])
  useEffect(() => { void reload().catch(() => undefined) }, [reload])
  const value = useMemo(() => ({ shortcuts, reload, transform: (text: string, includeEnd = false) => applyLatexShortcuts(text, shortcuts, includeEnd) }), [shortcuts, reload])
  return <LatexContext.Provider value={value}>{children}</LatexContext.Provider>
}

export const useLatex = () => useContext(LatexContext)
