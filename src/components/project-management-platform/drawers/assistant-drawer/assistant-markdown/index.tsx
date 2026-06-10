import "./index.less";
import type { ReactNode } from "react";

type MarkdownBlock =
  | { depth: number; text: string; type: "heading" }
  | { text: string; type: "paragraph" }
  | { items: string[]; ordered: boolean; type: "list" }
  | { headers: string[]; rows: string[][]; type: "table" }
  | { text: string; type: "quote" };

type AssistantMarkdownProps = {
  content: string;
};

const headingPattern = /^(#{1,4})\s+(.+)$/;
const orderedListPattern = /^\d+\.\s+(.+)$/;
const unorderedListPattern = /^[-*]\s+(.+)$/;
const inlineTokenPattern = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`)/g;

function isTableRow(line: string) {
  const trimmed = line.trim();

  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function isTableDivider(line?: string) {
  if (!line) {
    return false;
  }

  return /^\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim() || "-");
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index]?.trim() ?? "";

  return Boolean(
    headingPattern.test(line) ||
      unorderedListPattern.test(line) ||
      orderedListPattern.test(line) ||
      line.startsWith(">") ||
      (isTableRow(line) && isTableDivider(lines[index + 1]))
  );
}

function collectListItemContinuation(lines: string[], startIndex: number, initialText: string) {
  let index = startIndex;
  const parts = [initialText];

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line || isBlockStart(lines, index)) {
      break;
    }

    parts.push(line);
    index += 1;
  }

  return {
    index,
    text: parts.join(" ")
  };
}

// 这里实现一个只服务 AI 助手报告的 Markdown 子集解析器，避免把模型输出当纯文本展示，
// 同时不执行 HTML，防止未来模型误输出标签时带来展示或安全风险。
function parseMarkdown(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(headingPattern);

    if (heading) {
      blocks.push({
        depth: heading[1].length,
        text: heading[2].trim(),
        type: "heading"
      });
      index += 1;
      continue;
    }

    if (isTableRow(line) && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];

      index += 2;

      while (index < lines.length && isTableRow(lines[index]) && !isTableDivider(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      blocks.push({
        headers,
        rows,
        type: "table"
      });
      continue;
    }

    const unordered = line.match(unorderedListPattern);
    const ordered = line.match(orderedListPattern);

    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];

      while (index < lines.length) {
        const listLine = lines[index].trim();
        const itemMatch = orderedList ? listLine.match(orderedListPattern) : listLine.match(unorderedListPattern);

        if (!itemMatch) {
          break;
        }

        const continuation = collectListItemContinuation(lines, index + 1, itemMatch[1].trim());

        items.push(continuation.text);
        index = continuation.index;
      }

      blocks.push({
        items,
        ordered: orderedList,
        type: "list"
      });
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({
        text: quoteLines.join(" "),
        type: "quote"
      });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const paragraphLine = lines[index].trim();

      if (!paragraphLine || isBlockStart(lines, index)) {
        break;
      }

      paragraphLines.push(paragraphLine);
      index += 1;
    }

    blocks.push({
      text: paragraphLines.join(" "),
      type: "paragraph"
    });
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  text.replace(inlineTokenPattern, (token, _unused, offset: number) => {
    if (offset > lastIndex) {
      nodes.push(text.slice(lastIndex, offset));
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-strong-${tokenIndex}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={`${keyPrefix}-code-${tokenIndex}`}>{token.slice(1, -1)}</code>);
    }

    lastIndex = offset + token.length;
    tokenIndex += 1;

    return token;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : text;
}

function renderTable(block: Extract<MarkdownBlock, { type: "table" }>, blockIndex: number) {
  return (
    <div className="assistant-markdown-table-wrap" key={`table-${blockIndex}`}>
      <table>
        <thead>
          <tr>
            {block.headers.map((header, headerIndex) => (
              <th key={`table-${blockIndex}-header-${headerIndex}`} scope="col">
                {renderInlineMarkdown(header, `table-${blockIndex}-header-${headerIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`table-${blockIndex}-row-${rowIndex}`}>
              {block.headers.map((_, cellIndex) => (
                <td key={`table-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`}>
                  {renderInlineMarkdown(row[cellIndex] ?? "-", `table-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// AI 助手消息以 Markdown 报告形式呈现；用户消息仍由父组件保持普通气泡展示。
export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  const blocks = parseMarkdown(content);

  return (
    <div className="assistant-markdown">
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          const HeadingTag = block.depth <= 3 ? "h3" : "h4";

          return (
            <HeadingTag
              className={`assistant-markdown-heading assistant-markdown-heading-${block.depth}`}
              key={`heading-${blockIndex}`}
            >
              {renderInlineMarkdown(block.text, `heading-${blockIndex}`)}
            </HeadingTag>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p className="assistant-markdown-paragraph" key={`paragraph-${blockIndex}`}>
              {renderInlineMarkdown(block.text, `paragraph-${blockIndex}`)}
            </p>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";

          return (
            <ListTag className="assistant-markdown-list" key={`list-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`list-${blockIndex}-item-${itemIndex}`}>
                  {renderInlineMarkdown(item, `list-${blockIndex}-item-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "table") {
          return renderTable(block, blockIndex);
        }

        return (
          <blockquote className="assistant-markdown-quote" key={`quote-${blockIndex}`}>
            {renderInlineMarkdown(block.text, `quote-${blockIndex}`)}
          </blockquote>
        );
      })}
    </div>
  );
}
