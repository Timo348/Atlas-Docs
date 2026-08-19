export function fileContentDisposition(name: string, disposition: "inline" | "attachment") {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
