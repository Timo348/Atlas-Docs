export type GanttTaskStatus = "none" | "active" | "done" | "crit";

export type GanttTask = {
  id: string;
  title: string;
  sectionId: string;
  start: string;
  duration: number;
  progress: number;
  status: GanttTaskStatus;
  after: string | null;
};

export type GanttSection = {
  id: string;
  title: string;
  tasks: GanttTask[];
};

export type GanttDocument = {
  title: string;
  dateFormat: "YYYY-MM-DD";
  axisFormat: string;
  directives: string[];
  sections: GanttSection[];
};

export type ParsedGantt =
  | { supported: true; document: GanttDocument }
  | { supported: false; reason: string };

export type GanttTaskSchedule = GanttTask & { end: string };

const DEFAULT_AXIS_FORMAT = "%d.%m.";
const DEFAULT_SECTION = "Planning";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the practical Mermaid Gantt subset Atlas creates and exports. Source
 * that relies on a different date format or an incomplete task is kept
 * unchanged rather than being rewritten by the visual planner.
 */
export function parseGanttSource(source: string): ParsedGantt {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const contentLines = lines.filter((line) => line.trim());
  if (!contentLines.length) return { supported: true, document: createEmptyGanttDocument() };
  if (contentLines[0]?.trim().toLowerCase() !== "gantt") {
    return { supported: false, reason: "The document does not start with a Mermaid gantt declaration." };
  }

  let title = "Project timeline";
  let axisFormat = DEFAULT_AXIS_FORMAT;
  // Mermaid's own default is YYYY-MM-DD, so imported plans may omit this
  // directive while still being safe for Atlas' day-based planner.
  let dateFormat = "YYYY-MM-DD";
  const directives: string[] = [];
  const sections: GanttSection[] = [];
  const progressByTask = new Map<string, number>();
  let currentSection: GanttSection | null = null;
  const seenTaskIds = new Set<string>();

  for (const rawLine of lines.slice(lines.indexOf(contentLines[0]) + 1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^%%\s*atlas-gantt-progress\s+/i.test(line)) {
      const progress = line.match(/^%%\s*atlas-gantt-progress\s+([^=\s]+)\s*=\s*(\d{1,3})\s*$/i);
      if (!progress) return { supported: false, reason: "An Atlas progress comment is incomplete." };
      progressByTask.set(progress[1], clampProgress(Number(progress[2])));
      continue;
    }
    if (line.startsWith("%%")) {
      directives.push(line);
      continue;
    }
    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, "").trim() || title;
      continue;
    }
    if (/^dateFormat\s+/i.test(line)) {
      dateFormat = line.replace(/^dateFormat\s+/i, "").trim();
      continue;
    }
    if (/^axisFormat\s+/i.test(line)) {
      axisFormat = line.replace(/^axisFormat\s+/i, "").trim() || axisFormat;
      continue;
    }
    if (/^section\s+/i.test(line)) {
      const sectionTitle = line.replace(/^section\s+/i, "").trim();
      if (!sectionTitle) return { supported: false, reason: "A Gantt section has no name." };
      currentSection = { id: uniqueId(`section-${sections.length + 1}`, new Set(sections.map((section) => section.id))), title: sectionTitle, tasks: [] };
      sections.push(currentSection);
      continue;
    }
    if (line.includes(":")) {
      if (!currentSection) {
        currentSection = { id: "section-1", title: DEFAULT_SECTION, tasks: [] };
        sections.push(currentSection);
      }
      const parsedTask = parseTaskLine(line, currentSection.id, seenTaskIds);
      if (!parsedTask) return { supported: false, reason: `The task “${line.slice(0, 80)}” uses a format the visual editor cannot safely change.` };
      currentSection.tasks.push(parsedTask);
      continue;
    }
    // Mermaid Gantt directives such as "excludes weekends" are intentionally
    // carried through verbatim. The visual editor does not need to understand
    // them in order to avoid discarding them.
    directives.push(line);
  }

  if (dateFormat !== "YYYY-MM-DD") {
    return { supported: false, reason: "The visual editor currently needs dateFormat YYYY-MM-DD." };
  }
  if (!sections.length) {
    return { supported: false, reason: "Add at least one section before opening this Gantt plan visually." };
  }
  if (directives.some((directive) => /^excludes\s+/i.test(directive))) {
    return { supported: false, reason: "This plan excludes dates, so Atlas cannot safely represent it in the planner." };
  }

  for (const section of sections) {
    for (const task of section.tasks) {
      task.progress = progressByTask.get(task.id) ?? defaultProgress(task.status);
    }
  }
  const document: GanttDocument = { title, dateFormat, axisFormat, directives, sections };
  return { supported: true, document: normalizeGanttDocument(document) };
}

export function createEmptyGanttDocument(language: "en" | "de" = "en"): GanttDocument {
  const section = language === "de" ? "Planung" : DEFAULT_SECTION;
  return {
    title: language === "de" ? "Projektplan" : "Project timeline",
    dateFormat: "YYYY-MM-DD",
    axisFormat: language === "de" ? DEFAULT_AXIS_FORMAT : "%b %d",
    directives: [],
    sections: [{ id: "section-1", title: section, tasks: [] }],
  };
}

export function serializeGanttDocument(value: GanttDocument) {
  const document = normalizeGanttDocument(value);
  const lines = [
    "gantt",
    `  title ${document.title.trim() || "Project timeline"}`,
    "  dateFormat YYYY-MM-DD",
    `  axisFormat ${document.axisFormat.trim() || DEFAULT_AXIS_FORMAT}`,
    ...document.directives.map((directive) => `  ${directive.trim()}`),
  ];
  for (const section of document.sections) {
    lines.push(`  section ${section.title.trim() || DEFAULT_SECTION}`);
    for (const task of section.tasks) {
      const tags = [task.status === "none" ? null : task.status, task.id, task.after ? `after ${task.after}` : task.start, `${Math.max(1, task.duration)}d`]
        .filter((tag): tag is string => Boolean(tag));
      lines.push(`  ${task.title.trim() || "Untitled task"} :${tags.join(", ")}`);
      lines.push(`  %% atlas-gantt-progress ${task.id}=${clampProgress(task.progress)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function addGanttTask(
  value: GanttDocument,
  input: Partial<Pick<GanttTask, "title" | "sectionId" | "start" | "duration" | "progress" | "status" | "after">> = {},
) {
  const document = normalizeGanttDocument(value);
  const section = document.sections.find((item) => item.id === input.sectionId) ?? document.sections[0]!;
  const usedIds = new Set(document.sections.flatMap((item) => item.tasks.map((task) => task.id)));
  const title = input.title?.trim() || "New task";
  const task: GanttTask = {
    id: uniqueId(slugify(title) || "task", usedIds),
    title,
    sectionId: section.id,
    start: isIsoDate(input.start) ? input.start! : nextSuggestedStart(document),
    duration: normalizeDuration(input.duration ?? 3),
    progress: clampProgress(input.progress ?? 0),
    status: input.status ?? "none",
    after: input.after ?? null,
  };
  return {
    ...document,
    sections: document.sections.map((item) => item.id === section.id ? { ...item, tasks: [...item.tasks, task] } : item),
  } satisfies GanttDocument;
}

export function updateGanttTask(
  value: GanttDocument,
  taskId: string,
  patch: Partial<Pick<GanttTask, "title" | "sectionId" | "start" | "duration" | "progress" | "status" | "after">>,
) {
  const document = normalizeGanttDocument(value);
  const task = document.sections.flatMap((section) => section.tasks).find((item) => item.id === taskId);
  if (!task) return document;
  const sectionId = document.sections.some((section) => section.id === patch.sectionId) ? patch.sectionId! : task.sectionId;
  const directStart = isIsoDate(patch.start) ? patch.start : null;
  const nextTask: GanttTask = {
    ...task,
    ...patch,
    sectionId,
    title: patch.title === undefined ? task.title : patch.title.slice(0, 240),
    start: directStart ?? task.start,
    duration: normalizeDuration(patch.duration ?? task.duration),
    progress: clampProgress(patch.progress ?? task.progress),
    status: patch.status ?? task.status,
    // Picking a concrete date is an explicit choice to break the dependency.
    after: directStart ? null : (patch.after === undefined ? task.after : patch.after || null),
  };
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      tasks: section.id === task.sectionId && section.id === sectionId
        ? section.tasks.map((item) => item.id === taskId ? nextTask : item)
        : section.id === task.sectionId
          ? section.tasks.filter((item) => item.id !== taskId)
          : section.id === sectionId
            ? [...section.tasks, nextTask]
            : section.tasks,
    })),
  } satisfies GanttDocument;
}

export function deleteGanttTask(value: GanttDocument, taskId: string) {
  const document = normalizeGanttDocument(value);
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      tasks: section.tasks.map((task) => task.after === taskId ? { ...task, after: null } : task).filter((task) => task.id !== taskId),
    })),
  } satisfies GanttDocument;
}

export function addGanttSection(value: GanttDocument, title: string) {
  const document = normalizeGanttDocument(value);
  const usedIds = new Set(document.sections.map((section) => section.id));
  return {
    ...document,
    sections: [...document.sections, { id: uniqueId(`section-${document.sections.length + 1}`, usedIds), title: title.trim().slice(0, 120) || DEFAULT_SECTION, tasks: [] }],
  } satisfies GanttDocument;
}

export function updateGanttDocument(value: GanttDocument, patch: Partial<Pick<GanttDocument, "title" | "axisFormat">>) {
  return normalizeGanttDocument({ ...value, ...patch });
}

export function scheduledGanttTasks(document: GanttDocument): GanttTaskSchedule[] {
  const tasks = document.sections.flatMap((section) => section.tasks);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const scheduled = new Map<string, GanttTaskSchedule>();
  const resolving = new Set<string>();
  const firstStart = tasks.map((task) => task.start).find(isIsoDate) ?? "2026-01-01";

  function resolve(task: GanttTask): GanttTaskSchedule {
    const cached = scheduled.get(task.id);
    if (cached) return cached;
    if (resolving.has(task.id)) return { ...task, after: null, start: task.start || firstStart, end: addDays(task.start || firstStart, task.duration) };
    resolving.add(task.id);
    const predecessor = task.after ? byId.get(task.after) : undefined;
    const previous = predecessor ? resolve(predecessor) : null;
    const start = previous ? addDays(previous.end, 1) : (isIsoDate(task.start) ? task.start : firstStart);
    const value = { ...task, start, end: addDays(start, Math.max(1, task.duration) - 1) };
    scheduled.set(task.id, value);
    resolving.delete(task.id);
    return value;
  }

  return tasks.map(resolve);
}

export function addDays(value: string, amount: number) {
  const date = dateFromIso(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  const left = dateFromIso(start);
  const right = dateFromIso(end);
  if (!left || !right) return 0;
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}

/** Converts inclusive planner dates back to Mermaid's duration syntax. */
export function ganttDurationFromDates(start: string, end: string) {
  if (!isIsoDate(start) || !isIsoDate(end)) return 1;
  return Math.max(1, daysBetween(start, end) + 1);
}

export function isIsoDate(value: string | undefined | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  return Boolean(dateFromIso(value));
}

function parseTaskLine(line: string, sectionId: string, seenTaskIds: Set<string>): GanttTask | null {
  const separator = line.indexOf(":");
  const title = line.slice(0, separator).trim();
  const values = line.slice(separator + 1).split(",").map((value) => value.trim()).filter(Boolean);
  if (!title || values.length < 2) return null;
  let status: GanttTaskStatus = "none";
  if (values[0] === "active" || values[0] === "done" || values[0] === "crit") status = values.shift()! as GanttTaskStatus;
  const durationValue = values.at(-1);
  const duration = durationValue?.match(/^(\d+)d$/i);
  if (!duration || !durationValue) return null;
  values.pop();
  let id = values.shift();
  if (!id) return null;
  let after: string | null = null;
  let start = "";
  const schedule = values.shift();
  if (schedule?.toLowerCase().startsWith("after ")) {
    after = slugify(schedule.slice(6).trim()) || null;
  } else if (isIsoDate(schedule)) {
    start = schedule;
  } else if (isIsoDate(id)) {
    // Mermaid also allows an omitted task id. Give that task a stable Atlas id.
    start = id;
    id = slugify(title) || "task";
  } else {
    return null;
  }
  if (values.length) return null;
  id = uniqueId(id, seenTaskIds);
  return { id, title: title.slice(0, 240), sectionId, start: start || "2026-01-01", duration: normalizeDuration(Number(duration[1])), progress: defaultProgress(status), status, after };
}

function normalizeGanttDocument(value: GanttDocument): GanttDocument {
  const sectionIds = new Set<string>();
  const taskIds = new Set<string>();
  const sections = (value.sections.length ? value.sections : [{ id: "section-1", title: DEFAULT_SECTION, tasks: [] }]).map((section, index) => {
    const id = uniqueId(section.id || `section-${index + 1}`, sectionIds);
    const tasks = section.tasks.map((task) => ({
      ...task,
      id: uniqueId(task.id || slugify(task.title) || "task", taskIds),
      sectionId: id,
      title: task.title.slice(0, 240),
      start: isIsoDate(task.start) ? task.start : "2026-01-01",
      duration: normalizeDuration(task.duration),
      progress: clampProgress(task.progress),
      status: task.status === "active" || task.status === "done" || task.status === "crit" ? task.status : "none" as const,
      after: task.after?.trim() || null,
    }));
    return { id, title: section.title.slice(0, 120), tasks };
  });
  return {
    title: value.title.slice(0, 240),
    dateFormat: "YYYY-MM-DD",
    axisFormat: value.axisFormat.slice(0, 120),
    directives: value.directives.map((line) => line.trim()).filter(Boolean),
    sections,
  };
}

function uniqueId(candidate: string, used: Set<string>) {
  const normalized = slugify(candidate) || "item";
  let id = normalized;
  let suffix = 2;
  while (used.has(id)) id = `${normalized}-${suffix++}`;
  used.add(id);
  return id;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeDuration(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(3650, Math.round(value))) : 1;
}

function clampProgress(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function defaultProgress(status: GanttTaskStatus) {
  return status === "done" ? 100 : status === "active" ? 50 : 0;
}

function dateFromIso(value: string) {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextSuggestedStart(document: GanttDocument) {
  const schedules = scheduledGanttTasks(document);
  if (!schedules.length) return new Date().toISOString().slice(0, 10);
  return addDays(schedules.reduce((latest, task) => task.end > latest ? task.end : latest, schedules[0]!.end), 1);
}
