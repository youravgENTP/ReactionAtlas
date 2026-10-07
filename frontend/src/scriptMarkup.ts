export type InlineToken = { type: 'text' | 'sub' | 'sup'; text: string; start: number; end: number }

export function tokenizeInlineMarkup(value: string, includeEnd = true): InlineToken[] {
  const tokens: InlineToken[] = []
  let plainStart = 0
  let index = 0
  const pushText = (start: number, end: number) => {
    if (end > start) tokens.push({ type: 'text', text: value.slice(start, end), start, end })
  }
  while (index < value.length) {
    const escapedSub = value.startsWith('\\_', index) || value.startsWith('₩_', index)
    const bareSub = value[index] === '_'
    const isSub = escapedSub || bareSub
    const isSup = value[index] === '^' && (index === 0 || !['\\', '₩'].includes(value[index - 1]))
    if (!isSub && !isSup) { index += codePointLength(value, index); continue }
    const markerLength = isSub ? (escapedSub ? 2 : 1) : 1
    const contentStart = index + markerLength
    let content = ''
    let end = contentStart
    if (value[contentStart] === '{') {
      const close = value.indexOf('}', contentStart + 1)
      if (close < 0 || close === contentStart + 1) { index += markerLength; continue }
      content = value.slice(contentStart + 1, close)
      end = close + 1
    } else {
      const character = Array.from(value.slice(contentStart))[0]
      if (!character || /\s/.test(character)) { index += markerLength; continue }
      end = contentStart + character.length
      if (!includeEnd && end === value.length) { index += markerLength; continue }
      content = character
    }
    pushText(plainStart, index)
    tokens.push({ type: isSub ? 'sub' : 'sup', text: content, start: index, end })
    index = end
    plainStart = end
  }
  pushText(plainStart, value.length)
  return tokens
}

function codePointLength(value: string, index: number) { return value.codePointAt(index)! > 0xffff ? 2 : 1 }
