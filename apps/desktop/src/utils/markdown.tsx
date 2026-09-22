import type { ReactNode } from 'react';

/// <summary>
/// Renders the small subset of Markdown that shows up in GitHub release notes: #/##/### headers,
/// **bold**, `code`, [links](url), and -/* bullet lists. Anything else renders as plain text —
/// good enough for release notes without pulling in a full Markdown dependency.
/// </summary>
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={`${keyPrefix}-${index}`}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<code key={`${keyPrefix}-${index}`}>{match[2]}</code>);
    else if (match[3] !== undefined)
      nodes.push(
        <a key={`${keyPrefix}-${index}`} href={match[4]} target="_blank" rel="noreferrer">
          {match[3]}
        </a>,
      );
    lastIndex = pattern.lastIndex;
    index += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];
  let blockIndex = 0;

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`ul-${blockIndex++}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInline(item, `li-${blockIndex}-${index}`)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blockIndex++}`}>{renderInline(paragraph.join(' '), `p-${blockIndex}`)}</p>);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!line) {
      flushList();
      flushParagraph();
    } else if (heading) {
      flushList();
      flushParagraph();
      const level = Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4;
      const Tag = `h${level + 2 > 6 ? 6 : level + 2}` as unknown as 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(<Tag key={`h-${blockIndex++}`}>{renderInline(heading[2], `h-${blockIndex}`)}</Tag>);
    } else if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushList();
  flushParagraph();
  return blocks;
}
