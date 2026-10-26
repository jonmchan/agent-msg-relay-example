import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { completeTask } from "../lib/tasks.js";

export default defineTool({
  description: "Mark one task done on this personal assistant's local list.",
  effect: "write",
  inputSchema: z.object({
    id: z.string().min(1).describe("Task id from list_tasks."),
  }),
  async execute({ id }, ctx) {
    return { task: await completeTask(ctx, id), list: "personal-assistant-local" };
  },
});
