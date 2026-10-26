import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { deleteTask } from "../lib/tasks.js";

export default defineTool({
  description: "Remove one task from this personal assistant's local list by id.",
  effect: "write",
  inputSchema: z.object({
    id: z.string().min(1).describe("Task id from list_tasks."),
  }),
  async execute({ id }, ctx) {
    return { task: await deleteTask(ctx, id), list: "personal-assistant-local" };
  },
});
