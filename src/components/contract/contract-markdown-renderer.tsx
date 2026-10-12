"use client"

/**
 * ContractMarkdownRenderer
 * Renders AI-generated contract content with proper legal document styling.
 *
 * The AI now writes plain text, not Markdown (see backend/services/ai.js) — the target
 * audience doesn't know Markdown, and this renderer never supported tables anyway, which
 * made an AI-drawn Markdown signature table render as garbled "| | |" text. The plain-text
 * convention: first non-empty line = document title (any case), lines starting with
 * "Article N" / "Chapitre" / "Titre" / "Préambule" / "Annexe" = section headers, blank
 * lines separate paragraphs. Markdown syntax (#, ##, **bold**, lists) is still recognized
 * below for backward compatibility with contracts generated before this change.
 */
const SECTION_HEADER_RE = /^(article\s+\d+|chapitre\b|titre\s+[ivx\d]|préambule\b|préambule\s*:|annexe\s*\d*)/i

export function ContractMarkdownRenderer({ content }: { content: string }) {
  if (!content) {
    return (
      <p className="text-muted-foreground italic text-sm">
        Chargement du contenu...
      </p>
    )
  }

  // Parse to React elements without external lib to avoid SSR issues
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let titleConsumed = false

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Plain-text document title: the first non-empty line, when it isn't itself a
    // section header (a contract can legitimately open straight on "Préambule").
    if (!titleConsumed && trimmed !== '' && !line.startsWith('#') && !SECTION_HEADER_RE.test(trimmed)) {
      titleConsumed = true
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-gray-900 mt-2 mb-4 pb-3 border-b-2 border-gray-200 uppercase tracking-wide text-center">
          {formatInline(trimmed)}
        </h1>
      )
      i++
      continue
    }
    if (trimmed !== '') titleConsumed = true

    // Plain-text section header: "Article 3 - ...", "Chapitre II ...", "Préambule", "Annexe 1 ..."
    if (SECTION_HEADER_RE.test(trimmed) && trimmed.length < 140) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-gray-800 mt-8 mb-3 pb-1 border-b border-gray-200 uppercase tracking-wide">
          {formatInline(trimmed)}
        </h2>
      )
    }
    // H1 (legacy Markdown)
    else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-gray-900 mt-10 mb-4 pb-3 border-b-2 border-gray-200 uppercase tracking-wide text-center">
          {formatInline(line.slice(2).trim())}
        </h1>
      )
    }
    // H2 (legacy Markdown)
    else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-gray-800 mt-8 mb-3 pb-1 border-b border-gray-200 uppercase tracking-wide">
          {formatInline(line.slice(3).trim())}
        </h2>
      )
    }
    // H3 (legacy Markdown)
    else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-gray-700 mt-6 mb-2">
          {formatInline(line.slice(4).trim())}
        </h3>
      )
    }
    // Horizontal rule
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-gray-200 my-6" />)
    }
    // Leftover Markdown table row (legacy content only — the AI no longer draws these):
    // render as a plain space-separated line instead of literal "| a | b |" garbage.
    else if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean)
      const isSeparatorRow = cells.every(c => /^:?-+:?$/.test(c))
      if (!isSeparatorRow && cells.length > 0) {
        elements.push(
          <p key={i} className="text-gray-800 leading-relaxed my-1">
            {formatInline(cells.join('   —   '))}
          </p>
        )
      }
    }
    // Unordered list item
    else if (/^[-*•]\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        listItems.push(
          <li key={i} className="text-gray-700 leading-relaxed">
            {formatInline(lines[i].replace(/^[-*•]\s/, '').trim())}
          </li>
        )
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-3 pl-4">
          {listItems}
        </ul>
      )
      continue
    }
    // Ordered list item
    else if (/^\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(
          <li key={i} className="text-gray-700 leading-relaxed">
            {formatInline(lines[i].replace(/^\d+\.\s/, '').trim())}
          </li>
        )
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-3 pl-4">
          {listItems}
        </ol>
      )
      continue
    }
    // Blockquote
    else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-gray-300 pl-4 py-1 my-3 text-gray-600 italic bg-gray-50 rounded-r">
          {formatInline(line.slice(2).trim())}
        </blockquote>
      )
    }
    // Empty line - spacing
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    }
    // Regular paragraph
    else {
      elements.push(
        <p key={i} className="text-gray-800 leading-relaxed text-justify my-1">
          {formatInline(line)}
        </p>
      )
    }

    i++
  }

  return (
    // lining-nums: Georgia (the font-serif fallback here) defaults to old-style figures —
    // uneven digit height, some with descenders — which reads as an inconsistent/odd font
    // wherever amounts, dates or article numbers appear. Lining figures keep every digit
    // the same height, aligned with the surrounding text, as expected in a legal document.
    <div className="contract-content font-serif text-[15px] lining-nums tabular-nums">
      {elements}
      <p className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground not-italic font-sans">
        Ce contrat a été rédigé avec l'assistance d'une intelligence artificielle. Il ne constitue pas un avis juridique et il est recommandé de le faire réviser par un professionnel du droit avant signature, en particulier pour un engagement à enjeu significatif.
      </p>
    </div>
  )
}

/**
 * Format inline markdown: **bold**, *italic*, `code`, __bold__
 */
function formatInline(text: string): React.ReactNode {
  if (!text) return null

  const parts: React.ReactNode[] = []
  // Regex to find **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|__[^_]+__)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const raw = match[0]
    if (raw.startsWith('**') || raw.startsWith('__')) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-bold text-gray-900">
          {raw.slice(2, -2)}
        </strong>
      )
    } else if (raw.startsWith('*')) {
      // Italic
      parts.push(
        <em key={match.index} className="italic">
          {raw.slice(1, -1)}
        </em>
      )
    } else if (raw.startsWith('`')) {
      // The AI sometimes wraps a number/amount in backticks out of habit — this is a legal
      // document, not code, so it must stay in the same serif body font as the rest of the
      // paragraph rather than switching to a monospace "code" style.
      parts.push(raw.slice(1, -1))
    }

    lastIndex = match.index + raw.length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : parts
}
