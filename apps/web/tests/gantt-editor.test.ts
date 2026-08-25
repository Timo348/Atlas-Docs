import assert from "node:assert/strict";
import test from "node:test";
import {
  addGanttTask,
  createEmptyGanttDocument,
  deleteGanttTask,
  ganttDurationFromDates,
  parseGanttSource,
  scheduledGanttTasks,
  serializeGanttDocument,
  updateGanttTask,
} from "../src/lib/gantt-editor";

const source = `gantt
  title Projektplan
  dateFormat YYYY-MM-DD
  axisFormat %d.%m.
  section Planung
  Anforderungen :done, anforderungen, 2026-09-01, 5d
  %% atlas-gantt-progress anforderungen=100
  Umsetzung :active, umsetzung, after anforderungen, 10d
  %% atlas-gantt-progress umsetzung=45
`;

test("reads existing Mermaid Gantt plans into editable visual tasks", () => {
  const parsed = parseGanttSource(source);
  assert.equal(parsed.supported, true);
  if (!parsed.supported) return;

  assert.equal(parsed.document.title, "Projektplan");
  assert.equal(parsed.document.sections[0]?.tasks[0]?.status, "done");
  assert.equal(parsed.document.sections[0]?.tasks[1]?.after, "anforderungen");
  assert.equal(parsed.document.sections[0]?.tasks[1]?.progress, 45);

  const schedule = scheduledGanttTasks(parsed.document);
  assert.deepEqual(schedule.map((task) => [task.id, task.start, task.end]), [
    ["anforderungen", "2026-09-01", "2026-09-05"],
    ["umsetzung", "2026-09-06", "2026-09-15"],
  ]);
});

test("serializes visual updates as valid Mermaid source with progress metadata", () => {
  const parsed = parseGanttSource(source);
  assert.equal(parsed.supported, true);
  if (!parsed.supported) return;

  const changed = updateGanttTask(parsed.document, "umsetzung", { progress: 70, title: "Umsetzung & Tests" });
  assert.deepEqual(changed.sections[0]?.tasks.map((task) => task.id), ["anforderungen", "umsetzung"]);
  const serialized = serializeGanttDocument(changed);
  assert.match(serialized, /^gantt\n  title Projektplan\n  dateFormat YYYY-MM-DD\n/m);
  assert.match(serialized, /  Umsetzung & Tests :active, umsetzung, after anforderungen, 10d\n/);
  assert.match(serialized, /%% atlas-gantt-progress umsetzung=70/);

  const roundTrip = parseGanttSource(serialized);
  assert.equal(roundTrip.supported, true);
  if (!roundTrip.supported) return;
  assert.equal(roundTrip.document.sections[0]?.tasks[1]?.title, "Umsetzung & Tests");
  assert.equal(roundTrip.document.sections[0]?.tasks[1]?.progress, 70);
});

test("choosing a direct date removes a dependency and deleting a task clears dependents", () => {
  const parsed = parseGanttSource(source);
  assert.equal(parsed.supported, true);
  if (!parsed.supported) return;

  const directDate = updateGanttTask(parsed.document, "umsetzung", { start: "2026-09-12" });
  const task = directDate.sections[0]?.tasks.find((item) => item.id === "umsetzung");
  assert.equal(task?.start, "2026-09-12");
  assert.equal(task?.after, null);

  const resized = updateGanttTask(parsed.document, "anforderungen", { duration: 8 });
  assert.equal(resized.sections[0]?.tasks.find((item) => item.id === "anforderungen")?.duration, 8);

  const deleted = deleteGanttTask(parsed.document, "anforderungen");
  assert.equal(deleted.sections[0]?.tasks.length, 1);
  assert.equal(deleted.sections[0]?.tasks[0]?.after, null);
});

test("converts inclusive planner start and end dates into Mermaid durations", () => {
  assert.equal(ganttDurationFromDates("2026-09-01", "2026-09-01"), 1);
  assert.equal(ganttDurationFromDates("2026-09-01", "2026-09-05"), 5);
  assert.equal(ganttDurationFromDates("2026-09-05", "2026-09-01"), 1);
});

test("accepts a standalone Mermaid Gantt plan for planner import", () => {
  const imported = parseGanttSource(`gantt
  title Imported roadmap
  section Delivery
  Design :design, 2026-10-05, 3d
  Release :release, after design, 2d
`);
  assert.equal(imported.supported, true);
  if (!imported.supported) return;

  assert.deepEqual(scheduledGanttTasks(imported.document).map((task) => [task.id, task.start, task.end]), [
    ["design", "2026-10-05", "2026-10-07"],
    ["release", "2026-10-08", "2026-10-09"],
  ]);
  assert.match(serializeGanttDocument(imported.document), /section Delivery/);
});

test("creates a usable visual plan and gives new tasks unique Mermaid ids", () => {
  const initial = createEmptyGanttDocument("de");
  const first = addGanttTask(initial, { title: "Abnahme", start: "2026-10-01" });
  const second = addGanttTask(first, { title: "Abnahme", start: "2026-10-05" });
  const tasks = second.sections[0]?.tasks ?? [];
  assert.deepEqual(tasks.map((task) => task.id), ["abnahme", "abnahme-2"]);
  assert.match(serializeGanttDocument(second), /section Planung/);
});

test("leaves incompatible date formats unchanged instead of rewriting them", () => {
  const parsed = parseGanttSource(`gantt\n  dateFormat DD-MM-YYYY\n  section Plan\n  Start :task, 01-09-2026, 5d\n`);
  assert.equal(parsed.supported, false);
  if (!parsed.supported) assert.match(parsed.reason, /format|YYYY-MM-DD/i);
});

test("keeps plans with excluded dates unchanged so the visual timeline cannot misrepresent them", () => {
  const parsed = parseGanttSource(`gantt\n  title Workdays\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  section Plan\n  Start :start, 2026-09-01, 5d\n`);
  assert.equal(parsed.supported, false);
  if (!parsed.supported) assert.match(parsed.reason, /excludes dates/i);
});
