import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { parseMarkdownLite, type InlineNode } from '@/lib/ui/markdown-lite'

interface MarkdownTextProps {
  source: string
  className?: string
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.type === 'strong' ? (
          <strong key={i} className="font-semibold text-foreground">
            {n.text}
          </strong>
        ) : n.type === 'code' ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {n.text}
          </code>
        ) : (
          <Fragment key={i}>{n.text}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * Renders job descriptions and notes written in light Markdown as readable
 * text: headings become small section labels, lists get bullets. Server
 * component, no dependency, no HTML injection (see lib/ui/markdown-lite.ts).
 */
export function MarkdownText({ source, className }: MarkdownTextProps) {
  const blocks = parseMarkdownLite(source)
  return (
    <div className={cn('space-y-3 break-words text-sm leading-relaxed text-foreground/90', className)}>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return (
            <p key={i} className="pt-1 text-sm font-semibold text-foreground first:pt-0">
              <Inline nodes={b.inline} />
            </p>
          )
        }
        if (b.type === 'list') {
          const ListTag = b.ordered ? 'ol' : 'ul'
          return (
            <ListTag
              key={i}
              className={cn('space-y-1 pl-5', b.ordered ? 'list-decimal' : 'list-disc', 'marker:text-muted-foreground')}
            >
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline nodes={item} />
                </li>
              ))}
            </ListTag>
          )
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                <Inline nodes={line} />
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
