export const MARKDOWN_TEXT_COLORS = [
  { id: "red", label: ["Red", "Rot"] },
  { id: "orange", label: ["Orange", "Orange"] },
  { id: "yellow", label: ["Yellow", "Gelb"] },
  { id: "green", label: ["Green", "Grün"] },
  { id: "blue", label: ["Blue", "Blau"] },
  { id: "purple", label: ["Purple", "Lila"] },
] as const;

export type MarkdownTextColor = typeof MARKDOWN_TEXT_COLORS[number]["id"];

type MarkdownNode = {
  type?: unknown;
  value?: unknown;
  children?: unknown[];
  data?: Record<string, unknown>;
};

const MARKDOWN_TEXT_COLOR_IDS = new Set<string>(MARKDOWN_TEXT_COLORS.map((color) => color.id));
const colorMarker = new RegExp(`\\[\\[color:(${MARKDOWN_TEXT_COLORS.map((color) => color.id).join("|")})\\|`);

export function isMarkdownTextColor(value: string): value is MarkdownTextColor {
  return MARKDOWN_TEXT_COLOR_IDS.has(value);
}

export function colorMarkdownText(color: MarkdownTextColor, text: string): string {
  return `[[color:${color}|${text}]]`;
}

/**
 * Renders Atlas' Markdown-only colour syntax, for example
 * `[[color:blue|Visible text]]`, as a restricted span. It deliberately uses
 * only the fixed palette above so document content cannot inject CSS values.
 */
export function remarkAtlasTextColor() {
  return (tree: unknown) => visit(tree);
}

function visit(value: unknown) {
  if (!isMarkdownNode(value) || !Array.isArray(value.children)) return;
  for (const child of value.children) visit(child);
  value.children = transformChildren(value.children);
}

function transformChildren(children: unknown[]) {
  const transformed: MarkdownNode[] = [];
  let active: { color: MarkdownTextColor; children: MarkdownNode[]; raw: MarkdownNode[] } | null = null;

  const appendPlain = (text: string) => {
    if (text) transformed.push(textNode(text));
  };
  const appendColoredText = (text: string) => {
    if (!text || !active) return;
    const node = textNode(text);
    active.children.push(node);
    active.raw.push(node);
  };

  for (const child of children) {
    if (!isMarkdownNode(child)) continue;
    if (child.type !== "text" || typeof child.value !== "string") {
      if (active) {
        active.children.push(child);
        active.raw.push(child);
      } else transformed.push(child);
      continue;
    }

    let remaining = child.value;
    while (remaining) {
      if (active) {
        const closeAt = remaining.indexOf("]]");
        if (closeAt === -1) {
          appendColoredText(remaining);
          remaining = "";
          continue;
        }
        appendColoredText(remaining.slice(0, closeAt));
        transformed.push(coloredNode(active.color, active.children));
        active = null;
        remaining = remaining.slice(closeAt + 2);
        continue;
      }

      const opening = colorMarker.exec(remaining);
      if (!opening || opening.index === undefined) {
        appendPlain(remaining);
        remaining = "";
        continue;
      }
      appendPlain(remaining.slice(0, opening.index));
      const color = opening[1] as MarkdownTextColor;
      active = { color, children: [], raw: [textNode(opening[0])] };
      remaining = remaining.slice(opening.index + opening[0].length);
    }
  }

  if (active) transformed.push(...active.raw);
  return transformed;
}

function isMarkdownNode(value: unknown): value is MarkdownNode {
  return Boolean(value) && typeof value === "object";
}

function textNode(value: string): MarkdownNode {
  return { type: "text", value };
}

function coloredNode(color: MarkdownTextColor, children: MarkdownNode[]): MarkdownNode {
  return {
    type: "atlasTextColor",
    data: {
      hName: "span",
      hProperties: { className: ["atlas-text-color", `atlas-text-color-${color}`] },
    },
    children,
  };
}
