import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { clearTasks } from "../lib/tasks.js";

export default defineTool({
  description:
    "Clear tasks from this fridge bot's local list. Use status all to reset the demo, or open/done to clear one group.",
  effect: "write",
  inputSchema: z.object({
    status: z
      .enum(["all", "open", "done"])
      .optional()
      .describe('Which tasks to remove. Defaults to "all".'),
  }),
  async execute({ status }, ctx) {
    return { list: "fridge-local", ...(await clearTasks(ctx, { status })) };
  },
});
