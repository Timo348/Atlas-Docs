import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const languageNeutralCopy = new Set([
  "Atlas",
  "Atlas Docs",
  "Canvas",
  "Deutsch",
  "English",
  "Helvetica / Arial",
  "Inter",
  "LaTeX",
  "LATEX",
  "Lora",
  "Markdown",
  "MARKDOWN",
  "v",
]);
const userFacingAttributes = new Set(["aria-label", "placeholder", "title"]);
const codedErrorRouteExceptions = new Set([
  "auth/[...nextauth]/route.ts",
  "health/route.ts",
]);

function source(path: string) {
  return readFileSync(join(sourceRoot, ...path.split("/")), "utf8");
}

test("high-risk interface components do not contain untranslated visible copy", () => {
  const components = [
    "components/collaborative-canvas.tsx",
    "components/collaborative-editor.tsx",
    "components/hybrid-markdown-document.tsx",
    "components/latex-preview.tsx",
    "components/page-share-dialog.tsx",
    "components/profile-dialog.tsx",
    "components/signin-form.tsx",
    "components/space-permissions-dialog.tsx",
    "components/space-picker.tsx",
    "components/shared-page-client.tsx",
    "components/shared-folder-client.tsx",
    "components/teams-admin.tsx",
    "components/users-admin.tsx",
    "components/workspace-shell.tsx",
  ];

  for (const component of components) {
    const content = source(component);
    const sourceFile = ts.createSourceFile(
      component,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const untranslated = untranslatedVisibleCopy(sourceFile);

    assert.deepEqual(
      untranslated,
      [],
      `${component} contains visible copy that is neither localized nor language-neutral`,
    );
    assert.doesNotMatch(content, /\b(?:result|data)\.error\b/, `${component} must localize API error codes`);
  }
});

test("authenticated admin pages inherit the user's preferences", () => {
  for (const page of ["app/admin/teams/page.tsx", "app/admin/users/page.tsx"]) {
    const content = source(page);
    assert.match(content, /normalizePreferences/);
    assert.match(content, /PreferencesProvider/);
  }
});

test("API routes use the stable coded error contract", () => {
  const apiRoot = join(sourceRoot, "app", "api");
  const routes = readdirSync(apiRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "route.ts")
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return {
        content: readFileSync(path, "utf8"),
        path: relative(apiRoot, path).split(sep).join("/"),
      };
    });

  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.doesNotMatch(
      route.content,
      /(?:NextResponse|Response)\.json\(\s*\{\s*(?:error|["']error["'])\s*:/,
      `${route.path} must not return an uncoded JSON error`,
    );
    if (!codedErrorRouteExceptions.has(route.path)) {
      assert.match(
        route.content,
        /\bapiErrorResponse\(/,
        `${route.path} must use the stable coded error response`,
      );
    }
  }
});

function untranslatedVisibleCopy(sourceFile: ts.SourceFile) {
  const findings: string[] = [];

  function record(value: string, node: ts.Node, kind: string) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!/\p{L}/u.test(normalized) || languageNeutralCopy.has(normalized)) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push(`${sourceFile.fileName}:${position.line + 1} ${kind}: ${JSON.stringify(normalized)}`);
  }

  function inspectExpression(expression: ts.Expression | undefined, kind: string): void {
    if (!expression) return;
    if (
      ts.isParenthesizedExpression(expression)
      || ts.isAsExpression(expression)
      || ts.isNonNullExpression(expression)
      || ts.isTypeAssertionExpression(expression)
    ) {
      inspectExpression(expression.expression, kind);
      return;
    }
    if (ts.isStringLiteralLike(expression)) {
      record(expression.text, expression, kind);
      return;
    }
    if (ts.isTemplateExpression(expression)) {
      record(expression.getText(sourceFile), expression, kind);
      return;
    }
    if (ts.isConditionalExpression(expression)) {
      inspectExpression(expression.whenTrue, kind);
      inspectExpression(expression.whenFalse, kind);
      return;
    }
    if (ts.isBinaryExpression(expression)) {
      const operator = expression.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        inspectExpression(expression.right, kind);
        return;
      }
      if (
        operator === ts.SyntaxKind.BarBarToken
        || operator === ts.SyntaxKind.QuestionQuestionToken
        || operator === ts.SyntaxKind.PlusToken
      ) {
        inspectExpression(expression.left, kind);
        inspectExpression(expression.right, kind);
      }
      return;
    }
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "text") {
      return;
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) {
      record(node.text, node, "JSX text");
    } else if (
      ts.isJsxExpression(node)
      && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      inspectExpression(node.expression, "JSX expression");
    } else if (
      ts.isJsxAttribute(node)
      && userFacingAttributes.has(node.name.getText(sourceFile))
      && node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer)) {
        record(node.initializer.text, node.initializer, `${node.name.getText(sourceFile)} attribute`);
      } else if (ts.isJsxExpression(node.initializer)) {
        inspectExpression(node.initializer.expression, `${node.name.getText(sourceFile)} attribute`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}
