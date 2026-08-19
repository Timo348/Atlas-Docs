import highlight from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import java from "highlight.js/lib/languages/java";
import python from "highlight.js/lib/languages/python";

const languages = { bash, c, cpp, csharp, java, python } as const;

for (const [name, language] of Object.entries(languages)) {
  highlight.registerLanguage(name, language);
}

const aliases: Record<string, keyof typeof languages> = {
  "c#": "csharp",
  "c++": "cpp",
  cs: "csharp",
  dotnet: "csharp",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
};

export type HighlightedMarkdownCode = {
  html: string;
  language: keyof typeof languages;
};

export function markdownCodeLanguage(className: string | undefined) {
  const declared = className?.match(/(?:^|\s)language-([^\s]+)/i)?.[1]?.toLowerCase();
  if (!declared) return null;
  const normalized = aliases[declared] ?? declared;
  return normalized in languages ? normalized as keyof typeof languages : null;
}

export function highlightMarkdownCode(source: string, className: string | undefined): HighlightedMarkdownCode | null {
  const language = markdownCodeLanguage(className);
  if (!language) return null;
  return {
    html: highlight.highlight(source, { language, ignoreIllegals: true }).value,
    language,
  };
}
