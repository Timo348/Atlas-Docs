# Editor and metrics review, September 30, 2026

The review for issues #38, #39, #40 and #21 used a frontier-model agent
(GPT-6 Astra), focused regression tests, and integration review.

## Findings addressed

- AtlasDoc rendered live text as React-managed `contentEditable` children.
  Each collaboration update replaced the text node and moved the caret to the
  start, reversing sequential input. Native controlled textareas keep editing,
  multiline input and selection stable.
- Markdown table cell parsing removed trailing whitespace on each keystroke.
  Cell serialization now preserves significant boundary spaces and maintains
  source/cell cursor offsets, including escaped pipes and numeric entities.
- Editors lacked application undo controls. Scoped Yjs histories capture local
  edits, exclude initialization and remote edits, and expose undo/redo buttons
  and keyboard shortcuts. Selection metadata restores the editing position.
- AtlasDoc provider effects recreated connections on language changes; stable
  dependencies retain the active document. Viewers no longer seed default data.
- AtlasDoc drag interactions now clean up pointer cancellation and lost focus.
- Metrics existed for admins but members could not receive a separate grant.
  The additive `metricsAccess` field, admin controls and current database checks
  enable grants and prompt revocation without granting administration rights.
- Aggregate upload storage omitted document and attachment assets. The metrics
  query includes their bytes.
- Next.js and sharp are patched to 15.5.26 and 0.35.5 following critical Next.js
  audit findings. `.npmrc` pins the public registry for reproducible installs.

## Existing limits

AtlasDoc stores each element as one atomic Y.Map value. Simultaneous edits to
the same element remain last-write-wins. Undo skips local edits superseded by
another user's update so it cannot overwrite their content. Changing that
storage model needs a separate compatibility and migration design.

Undo is local to the current editor session. Reloading or switching to a newly
mounted editor starts a new history; saved document versions remain available.

The dependency audit still reports pre-existing advisories in the diagram and
tooling dependency trees. This release patches the critical Next.js/sharp path;
it does not claim a completely clean dependency audit.

## Validation

Prisma validation, TypeScript checks, 239 web tests and 5 collaboration tests
pass. All three production images build. All 23 migrations apply successfully
on a fresh PostgreSQL database; web and collaboration health checks pass.
Browser checks cover sequential typing, middle edits, selection restoration,
Undo/Redo shortcuts and toolbar controls, table escaping, the remaining space
picker, and granting/revoking metrics through the admin UI in existing sessions.

`scripts/browser-smoke.cjs` runs these browser checks against a disposable local
production stack. Install Playwright separately (or set `ATLAS_PLAYWRIGHT_MODULE`
to its installed module path). Provide a `.env.qa` containing `APP_URL`,
`ADMIN_EMAIL` and `ADMIN_PASSWORD`, or set `ATLAS_QA_ENV` to another env file.
`ATLAS_BROWSER_CHANNEL=msedge` can select an installed Edge browser. The script
rejects nonlocal URLs and creates test pages, spaces and one member account.
Run it from the repository root; screenshots and results go to ignored `.qa/`.

```bash
node scripts/browser-smoke.cjs
```
