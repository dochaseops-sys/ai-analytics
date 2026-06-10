'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// Inline renderer – handles **bold**, *italic*, `code`, and plain text
// ---------------------------------------------------------------------------
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Pattern: **bold**, *italic*, `code`
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    if (match[2] !== undefined) {
      nodes.push(
        <strong key={match.index} className="font-semibold text-white">
          {match[2]}
        </strong>
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <em key={match.index} className="italic text-slate-300">
          {match[3]}
        </em>
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <code
          key={match.index}
          className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[0.78em] text-indigo-300 border border-slate-700"
        >
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Block-level parser
// ---------------------------------------------------------------------------
type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'hr' }
  | { type: 'code_block'; lang: string; code: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string }
  | { type: 'blank' };

function parseBlocks(raw: string): Block[] {
  const lines = raw.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code_block', lang, code: codeLines.join('\n') });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) { blocks.push({ type: 'h3', text: h3[1] }); i++; continue; }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { blocks.push({ type: 'h2', text: h2[1] }); i++; continue; }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { blocks.push({ type: 'h1', text: h1[1] }); i++; continue; }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      blocks.push({ type: 'blank' });
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s|```|---|\d+\.\s|[-*]\s)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'p', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------
function renderBlock(block: Block, idx: number): React.ReactNode {
  switch (block.type) {
    case 'h1':
      return (
        <h3 key={idx} className="mt-3 mb-1 text-base font-bold text-white">
          {renderInline(block.text)}
        </h3>
      );
    case 'h2':
      return (
        <h4 key={idx} className="mt-2.5 mb-1 text-sm font-bold text-slate-100">
          {renderInline(block.text)}
        </h4>
      );
    case 'h3':
      return (
        <h5 key={idx} className="mt-2 mb-0.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
          {renderInline(block.text)}
        </h5>
      );
    case 'hr':
      return <hr key={idx} className="my-3 border-slate-700" />;
    case 'code_block':
      return (
        <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/80">
          {block.lang && (
            <div className="border-b border-slate-700 px-3 py-1 text-[10px] font-mono text-slate-500">
              {block.lang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono leading-relaxed text-emerald-300 whitespace-pre-wrap break-words">
            {block.code}
          </pre>
        </div>
      );
    case 'ul':
      return (
        <ul key={idx} className="my-1.5 space-y-1 pl-1">
          {block.items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={idx} className="my-1.5 space-y-1 pl-1">
          {block.items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
                {j + 1}
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
    case 'p':
      return (
        <p key={idx} className="text-sm leading-relaxed text-slate-300">
          {renderInline(block.text)}
        </p>
      );
    case 'blank':
      return <div key={idx} className="h-1.5" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
interface ChatMessageProps {
  content: string;
  role: 'user' | 'model';
}

export function ChatMessage({ content, role }: ChatMessageProps) {
  if (role === 'user') {
    return <p className="text-sm leading-relaxed">{content}</p>;
  }

  const blocks = parseBlocks(content);
  return (
    <div className="space-y-0.5">
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  );
}
