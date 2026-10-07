import type { ReactNode } from 'react'
import { formatScriptHtml } from './richText'
import { tokenizeInlineMarkup } from './scriptMarkup'

export function FormattedText({ children }: { children: string | null | undefined }) {
  if (!children) return null
  return <>{tokenizeInlineMarkup(children).map((token, index): ReactNode => token.type === 'sub' ? <sub key={index}>{token.text}</sub> : token.type === 'sup' ? <sup key={index}>{token.text}</sup> : token.text)}</>
}

export function RichFormattedText({ text, html }: { text: string | null | undefined; html?: string | null }) {
  if (html) return <span className="rich-formatted-text" dangerouslySetInnerHTML={{ __html: formatScriptHtml(html) }} />
  return <FormattedText>{text}</FormattedText>
}
