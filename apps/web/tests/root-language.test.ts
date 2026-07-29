import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
}

test("the root document language prefers an active account preference", () => {
  const layout = source("app/layout.tsx");
  const auth = source("lib/auth.ts");

  assert.match(layout, /getServerSession\(authOptions\)/);
  assert.match(
    layout,
    /session\?\.user\?\.active\s*\?\s*session\.user\.language\s*:\s*cookieStore\.get\("atlas-language"\)/,
  );
  assert.match(auth, /language:\s*true/);
  assert.match(auth, /token\.language\s*=\s*current\.language\s*===\s*"de"\s*\?\s*"de"\s*:\s*"en"/);
  assert.match(auth, /session\.user\.language\s*=\s*token\.language\s*===\s*"de"\s*\?\s*"de"\s*:\s*"en"/);
});
