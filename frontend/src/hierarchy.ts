import type { StudyItem } from './types'

export function hierarchyMarker(depth: number, index: number) {
  if (depth === 0) return `${toRoman(index + 1).toLowerCase()})`
  if (depth === 1) return index < 20 ? String.fromCodePoint(0x2460 + index) : `(${index + 1})`
  if (depth === 2) return `${String.fromCharCode(97 + (index % 26))})`
  return '•'
}

export function newStudyItem(): StudyItem { return { id: crypto.randomUUID(), text: '' } }
export function updateStudyItem(items: StudyItem[], id: string, patch: Partial<StudyItem>): StudyItem[] { return items.map((item) => item.id === id ? { ...item, ...patch } : { ...item, ...(item.children ? { children: updateStudyItem(item.children, id, patch) } : {}) }) }
export function removeStudyItem(items: StudyItem[], id: string): StudyItem[] { return items.filter((item) => item.id !== id).map((item) => ({ ...item, ...(item.children ? { children: removeStudyItem(item.children, id) } : {}) })) }
export function flattenStudyItems(items: StudyItem[]): StudyItem[] { return items.flatMap((item) => [item, ...flattenStudyItems(item.children ?? [])]) }
export function previousStudyItemId(items: StudyItem[], id: string) { const rows = flattenStudyItems(items); const index = rows.findIndex((item) => item.id === id); return index > 0 ? rows[index - 1].id : undefined }
export function nextStudyItemId(items: StudyItem[], id: string) { const rows = flattenStudyItems(items); const index = rows.findIndex((item) => item.id === id); return index >= 0 && index < rows.length - 1 ? rows[index + 1].id : undefined }
export function addStudyItemAfter(items: StudyItem[], id: string, item = newStudyItem()) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path) return; listAt(root, path.slice(0, -1)).splice(path.at(-1)! + 1, 0, item) }) }
export function indentStudyItem(items: StudyItem[], id: string) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path) return; const index = path.at(-1)!; if (index === 0) return; const list = listAt(root, path.slice(0, -1)); const [item] = list.splice(index, 1); const previous = list[index - 1]; previous.children ??= []; previous.children.push(item) }) }
export function outdentStudyItem(items: StudyItem[], id: string) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path || path.length < 2) return; const index = path.at(-1)!; const parentPath = path.slice(0, -1); const parentIndex = parentPath.at(-1)!; const [item] = listAt(root, parentPath).splice(index, 1); listAt(root, parentPath.slice(0, -1)).splice(parentIndex + 1, 0, item) }) }

function toRoman(value: number) { const pairs: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let number = value; let result = ''; for (const [amount, symbol] of pairs) while (number >= amount) { result += symbol; number -= amount } return result }
function findPath(items: StudyItem[], id: string, prefix: number[] = []): number[] | null { for (let index = 0; index < items.length; index++) { if (items[index].id === id) return [...prefix, index]; const nested = items[index].children ? findPath(items[index].children!, id, [...prefix, index]) : null; if (nested) return nested } return null }
function listAt(root: StudyItem[], parentPath: number[]) { let list = root; for (const index of parentPath) { list[index].children ??= []; list = list[index].children! } return list }
function mutateTree(items: StudyItem[], mutate: (root: StudyItem[]) => void) { const next = structuredClone(items); mutate(next); return next }
