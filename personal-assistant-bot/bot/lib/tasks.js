const TASKS_KEY = "tasks";

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   notes?: string;
 *   status: "open" | "done";
 *   createdAt: string;
 *   source: string;
 * }} Task
 */

/** @param {import("@grok/agent-sdk").ToolContext} ctx */
async function readTasks(ctx) {
  const value = await ctx.host.kv.get(TASKS_KEY);
  if (!Array.isArray(value)) {
    return [];
  }
  return /** @type {Task[]} */ (value);
}

/** @param {import("@grok/agent-sdk").ToolContext} ctx @param {Task[]} tasks */
async function writeTasks(ctx, tasks) {
  await ctx.host.kv.put(TASKS_KEY, tasks);
}

/**
 * @param {import("@grok/agent-sdk").ToolContext} ctx
 * @param {{ title: string; notes?: string; source?: string }} input
 */
export async function addTask(ctx, input) {
  const tasks = await readTasks(ctx);
  /** @type {Task} */
  const task = {
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim(),
    status: "open",
    createdAt: new Date().toISOString(),
    source: input.source ?? "local",
    ...(input.notes === undefined || input.notes.trim() === ""
      ? {}
      : { notes: input.notes.trim() }),
  };
  tasks.push(task);
  await writeTasks(ctx, tasks);
  return task;
}

/** @param {import("@grok/agent-sdk").ToolContext} ctx */
export async function listTasks(ctx) {
  const tasks = await readTasks(ctx);
  const open = tasks.filter((task) => task.status === "open");
  const done = tasks.filter((task) => task.status === "done");
  return {
    openCount: open.length,
    doneCount: done.length,
    open,
    done,
  };
}

/**
 * @param {import("@grok/agent-sdk").ToolContext} ctx
 * @param {string} id
 */
export async function completeTask(ctx, id) {
  const tasks = await readTasks(ctx);
  const task = tasks.find((entry) => entry.id === id);
  if (task === undefined) {
    throw new Error(`No task "${id}" on this bot's list.`);
  }
  task.status = "done";
  await writeTasks(ctx, tasks);
  return task;
}

/**
 * @param {import("@grok/agent-sdk").ToolContext} ctx
 * @param {string} id
 */
export async function deleteTask(ctx, id) {
  const tasks = await readTasks(ctx);
  const index = tasks.findIndex((entry) => entry.id === id);
  if (index < 0) {
    throw new Error(`No task "${id}" on this bot's list.`);
  }
  const [task] = tasks.splice(index, 1);
  await writeTasks(ctx, tasks);
  return task;
}

/**
 * @param {import("@grok/agent-sdk").ToolContext} ctx
 * @param {{ status?: "open" | "done" | "all" }} [input]
 */
export async function clearTasks(ctx, input = {}) {
  const status = input.status ?? "all";
  const tasks = await readTasks(ctx);
  if (status === "all") {
    await writeTasks(ctx, []);
    return { cleared: tasks.length, remaining: 0, status };
  }
  const remaining = tasks.filter((task) => task.status !== status);
  const cleared = tasks.length - remaining.length;
  await writeTasks(ctx, remaining);
  return { cleared, remaining: remaining.length, status };
}
