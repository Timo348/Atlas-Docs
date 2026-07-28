import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(
  projectRoot,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist",
  "prod",
  "fonts",
);
const publicRoot = join(projectRoot, "apps", "web", "public");
const assetRoot = join(publicRoot, "excalidraw-assets");
const destinationDirectory = join(assetRoot, "fonts");

if (!destinationDirectory.startsWith(`${publicRoot}${sep}`)) {
  throw new Error("Refusing to prepare Excalidraw assets outside the web public directory.");
}

const packageJson = JSON.parse(
  await readFile(join(projectRoot, "node_modules", "@excalidraw", "excalidraw", "package.json"), "utf8"),
);
const sourceFiles = await listFiles(sourceDirectory);

if (sourceFiles.length === 0 || sourceFiles.some((file) => !file.endsWith(".woff2"))) {
  throw new Error("The Excalidraw package did not contain the expected self-hosted WOFF2 fonts.");
}

await rm(assetRoot, { recursive: true, force: true });
await mkdir(assetRoot, { recursive: true });
await cp(sourceDirectory, destinationDirectory, { recursive: true, force: true });

const files = {};
for (const sourceFile of sourceFiles) {
  const absolutePath = join(sourceDirectory, sourceFile);
  files[sourceFile.replaceAll(sep, "/")] = createHash("sha256")
    .update(await readFile(absolutePath))
    .digest("hex");
}

await writeFile(
  join(assetRoot, "manifest.json"),
  `${JSON.stringify({ package: packageJson.name, version: packageJson.version, files }, null, 2)}\n`,
);

console.log(`Prepared ${sourceFiles.length} self-hosted Excalidraw fonts.`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const child of await listFiles(absolutePath)) {
        files.push(join(entry.name, child));
      }
    } else if (entry.isFile()) {
      files.push(relative(directory, absolutePath));
    }
  }

  return files.sort();
}
