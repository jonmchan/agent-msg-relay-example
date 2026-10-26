import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { addTask } from "../lib/tasks.js";

export default defineTool({
  description:
    "Add a task to this personal assistant's local list. Use for errands, reminders, and personal to-dos that belong here.",
  effect: "write",
  inputSchema: z.object({
    title: z.string().min(1).describe("Short task title."),
    notes: z.string().optional().describe("Optional context or deadline notes."),
  }),
  async execute({ title, notes }, ctx) {
    const task = await addTask(ctx, { title, notes, source: "personal-assistant" });
    return { task, list: "personal-assistant-local" };
  },
});
