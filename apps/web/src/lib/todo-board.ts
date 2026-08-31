import * as Y from "yjs";

export const TODO_BOARD_MAP = "todo-board";
const TODO_TASKS_KEY = "tasks";
const TODO_BOARD_VERSION = 1;

export const TODO_COLUMNS = ["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;
export type TodoColumn = typeof TODO_COLUMNS[number];
export const TODO_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export type TodoPriority = typeof TODO_PRIORITIES[number];

export type TodoTask = {
  id: string;
  title: string;
  description: string;
  column: TodoColumn;
  priority: TodoPriority;
  deadline: string | null;
  blockedBy: string[];
  createdAt: number;
  updatedAt: number;
};

export type TodoTaskUpdate = Partial<Pick<TodoTask, "title" | "description" | "column" | "priority" | "deadline" | "blockedBy">>;

export function initializeTodoBoard(document: Y.Doc) {
  const board = document.getMap<unknown>(TODO_BOARD_MAP);
  if (board.has("version")) return false;
  document.transact(() => {
    board.set("version", TODO_BOARD_VERSION);
    board.set(TODO_TASKS_KEY, new Y.Map<unknown>());
  }, "initialize-todo-board");
  return true;
}

export function readTodoTasks(document: Y.Doc) {
  const tasks = readTaskMap(document);
  if (!tasks) return [];
  const entries = Array.from(tasks.entries());
  const knownTaskIds = new Set(entries.map(([id]) => id));
  return entries
    .flatMap(([id, value]) => {
      const task = toTodoTask(id, value, knownTaskIds);
      return task ? [task] : [];
    })
    .sort(compareTodoTasks);
}

export function addTodoTask(
  document: Y.Doc,
  input: { title: string; description?: string; column?: TodoColumn; priority?: TodoPriority; deadline?: string | null; blockedBy?: string[] },
) {
  const title = normalizeTitle(input.title);
  if (!title) return null;
  const tasks = ensureTaskMap(document);
  const blockedBy = normalizeTodoDependencies(input.blockedBy, new Set(tasks.keys()));
  const column = isTodoColumn(input.column) ? input.column : "NEW";
  if (column === "COMPLETED" && !todoDependenciesAreCompleted(tasks, blockedBy)) return null;
  const id = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const task = new Y.Map<unknown>();
  task.set("title", title);
  task.set("description", normalizeDescription(input.description));
  task.set("column", column);
  task.set("priority", isTodoPriority(input.priority) ? input.priority : "MEDIUM");
  task.set("deadline", normalizeDeadline(input.deadline));
  task.set("blockedBy", blockedBy);
  task.set("createdAt", now);
  task.set("updatedAt", now);
  document.transact(() => tasks.set(id, task), "add-todo-task");
  return id;
}

export function updateTodoTask(document: Y.Doc, id: string, update: TodoTaskUpdate) {
  const tasks = readTaskMap(document);
  if (!tasks) return false;
  const task = tasks.get(id);
  if (!(task instanceof Y.Map)) return false;
  const nextTitle = update.title === undefined ? undefined : normalizeTitle(update.title);
  if (update.title !== undefined && !nextTitle) return false;
  const blockedBy = update.blockedBy === undefined
    ? normalizeTodoDependencies(task.get("blockedBy"), new Set(tasks.keys()), id)
    : normalizeTodoDependencies(update.blockedBy, new Set(tasks.keys()), id);
  if (blockedBy.some((dependencyId) => wouldCreateTodoDependency(document, id, dependencyId))) return false;
  const column = update.column === undefined ? task.get("column") : update.column;
  if (column === "COMPLETED" && !todoDependenciesAreCompleted(tasks, blockedBy)) return false;
  document.transact(() => {
    if (nextTitle !== undefined) task.set("title", nextTitle);
    if (update.description !== undefined) task.set("description", normalizeDescription(update.description));
    if (update.column !== undefined && isTodoColumn(update.column)) task.set("column", update.column);
    if (update.priority !== undefined && isTodoPriority(update.priority)) task.set("priority", update.priority);
    if (update.deadline !== undefined) task.set("deadline", normalizeDeadline(update.deadline));
    if (update.blockedBy !== undefined) task.set("blockedBy", blockedBy);
    task.set("updatedAt", Date.now());
  }, "update-todo-task");
  return true;
}

export function deleteTodoTask(document: Y.Doc, id: string) {
  const tasks = readTaskMap(document);
  if (!tasks?.has(id)) return false;
  document.transact(() => {
    for (const [taskId, value] of tasks.entries()) {
      if (taskId === id || !(value instanceof Y.Map)) continue;
      const blockedBy = normalizeTodoDependencies(value.get("blockedBy"), new Set(tasks.keys()), taskId);
      if (blockedBy.includes(id)) {
        value.set("blockedBy", blockedBy.filter((dependencyId) => dependencyId !== id));
        value.set("updatedAt", Date.now());
      }
    }
    tasks.delete(id);
  }, "delete-todo-task");
  return true;
}

export function canCompleteTodoTask(document: Y.Doc, id: string) {
  const tasks = readTaskMap(document);
  const task = tasks?.get(id);
  if (!(task instanceof Y.Map) || !tasks) return false;
  const blockedBy = normalizeTodoDependencies(task.get("blockedBy"), new Set(tasks.keys()), id);
  return todoDependenciesAreCompleted(tasks, blockedBy);
}

export function todoTaskBlockers(document: Y.Doc, id: string) {
  const tasks = new Map(readTodoTasks(document).map((task) => [task.id, task]));
  const task = tasks.get(id);
  if (!task) return [];
  return task.blockedBy.flatMap((dependencyId) => {
    const dependency = tasks.get(dependencyId);
    return dependency && dependency.column !== "COMPLETED" ? [dependency] : [];
  });
}

export function wouldCreateTodoDependency(document: Y.Doc, id: string, dependencyId: string) {
  if (id === dependencyId) return true;
  const tasks = new Map(readTodoTasks(document).map((task) => [task.id, task]));
  if (!tasks.has(id) || !tasks.has(dependencyId)) return true;
  return todoTaskDependsOn(tasks, dependencyId, id, new Set());
}

export function compareTodoTasks(left: TodoTask, right: TodoTask) {
  const priorityDifference = priorityRank(right.priority) - priorityRank(left.priority);
  if (priorityDifference) return priorityDifference;
  const deadlineDifference = deadlineRank(left.deadline) - deadlineRank(right.deadline);
  if (deadlineDifference) return deadlineDifference;
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

export function todoDeadlineState(task: TodoTask, now = new Date()) {
  if (!task.deadline || task.column === "COMPLETED") return "none" as const;
  const today = localDateKey(now);
  if (task.deadline < today) return "overdue" as const;
  if (task.deadline === today) return "today" as const;
  return "upcoming" as const;
}

export function setTodoChecklistItemChecked(markdown: string, checklistItemIndex: number, checked: boolean) {
  if (!Number.isInteger(checklistItemIndex) || checklistItemIndex < 0) return markdown;
  let currentIndex = -1;
  return markdown.replace(/^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/gm, (match, prefix: string, _current: string, suffix: string) => {
    currentIndex += 1;
    return currentIndex === checklistItemIndex ? `${prefix}${checked ? "x" : " "}${suffix}` : match;
  });
}

export function serializeTodoBoard(document: Y.Doc) {
  return `${JSON.stringify({
    format: "atlas-todos",
    version: TODO_BOARD_VERSION,
    tasks: readTodoTasks(document),
  }, null, 2)}\n`;
}

export function serializeTodoBoardState(data: Uint8Array | null | undefined) {
  const document = new Y.Doc();
  try {
    if (data?.byteLength) Y.applyUpdate(document, data);
    return serializeTodoBoard(document);
  } finally {
    document.destroy();
  }
}

/** Copies only visible Todo state. Stale tasks vanish when a version is restored. */
export function copyTodoBoard(source: Y.Doc, target: Y.Doc) {
  const tasks = readTodoTasks(source);
  const targetBoard = target.getMap<unknown>(TODO_BOARD_MAP);
  target.transact(() => {
    targetBoard.clear();
    targetBoard.set("version", TODO_BOARD_VERSION);
    const targetTasks = new Y.Map<unknown>();
    targetBoard.set(TODO_TASKS_KEY, targetTasks);
    for (const item of tasks) {
      const task = new Y.Map<unknown>();
      task.set("title", item.title);
      task.set("description", item.description);
      task.set("column", item.column);
      task.set("priority", item.priority);
      task.set("deadline", item.deadline);
      task.set("blockedBy", item.blockedBy);
      task.set("createdAt", item.createdAt);
      task.set("updatedAt", item.updatedAt);
      targetTasks.set(item.id, task);
    }
  }, "copy-todo-board");
}

function ensureTaskMap(document: Y.Doc): Y.Map<unknown> {
  const board = document.getMap<unknown>(TODO_BOARD_MAP);
  const existing = board.get(TODO_TASKS_KEY);
  if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
  const tasks = new Y.Map<unknown>();
  document.transact(() => {
    if (!board.has("version")) board.set("version", TODO_BOARD_VERSION);
    board.set(TODO_TASKS_KEY, tasks);
  }, "repair-todo-board");
  return tasks;
}

function readTaskMap(document: Y.Doc): Y.Map<unknown> | null {
  const value = document.getMap<unknown>(TODO_BOARD_MAP).get(TODO_TASKS_KEY);
  return value instanceof Y.Map ? value as Y.Map<unknown> : null;
}

function toTodoTask(id: string, value: unknown, knownTaskIds: ReadonlySet<string>): TodoTask | null {
  if (!(value instanceof Y.Map)) return null;
  const title = normalizeTitle(value.get("title"));
  if (!title) return null;
  const column = value.get("column");
  const priority = value.get("priority");
  const deadline = normalizeDeadline(value.get("deadline"));
  return {
    id,
    title,
    description: normalizeDescription(value.get("description")),
    column: isTodoColumn(column) ? column : "NEW",
    priority: isTodoPriority(priority) ? priority : "MEDIUM",
    deadline,
    blockedBy: normalizeTodoDependencies(value.get("blockedBy"), knownTaskIds, id),
    createdAt: safeTime(value.get("createdAt")),
    updatedAt: safeTime(value.get("updatedAt")),
  };
}

function normalizeTitle(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function normalizeTodoDependencies(value: unknown, knownTaskIds?: ReadonlySet<string>, ownId?: string) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || candidate === ownId || (knownTaskIds && !knownTaskIds.has(candidate)) || result.includes(candidate)) continue;
    result.push(candidate);
  }
  return result;
}

function todoDependenciesAreCompleted(tasks: Y.Map<unknown>, blockedBy: readonly string[]) {
  return blockedBy.every((dependencyId) => {
    const dependency = tasks.get(dependencyId);
    return dependency instanceof Y.Map && dependency.get("column") === "COMPLETED";
  });
}

function todoTaskDependsOn(tasks: ReadonlyMap<string, TodoTask>, id: string, targetId: string, visited: Set<string>): boolean {
  if (id === targetId) return true;
  if (visited.has(id)) return false;
  visited.add(id);
  return tasks.get(id)?.blockedBy.some((dependencyId) => todoTaskDependsOn(tasks, dependencyId, targetId, visited)) ?? false;
}

function normalizeDescription(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 12000) : "";
}

function normalizeDeadline(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function isTodoColumn(value: unknown): value is TodoColumn {
  return typeof value === "string" && (TODO_COLUMNS as readonly string[]).includes(value);
}

function isTodoPriority(value: unknown): value is TodoPriority {
  return typeof value === "string" && (TODO_PRIORITIES as readonly string[]).includes(value);
}

function priorityRank(priority: TodoPriority) {
  return TODO_PRIORITIES.length - TODO_PRIORITIES.indexOf(priority);
}

function deadlineRank(deadline: string | null) {
  return deadline ? Number(deadline.replaceAll("-", "")) : Number.MAX_SAFE_INTEGER;
}

function safeTime(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function localDateKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
