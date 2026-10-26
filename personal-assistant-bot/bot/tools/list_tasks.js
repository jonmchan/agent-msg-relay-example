import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listTasks } from "../lib/tasks.js";

export default defineTool({
  description:
    "List open and done tasks on this personal assistant's local list. Call this before summarizing.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    return { list: "personal-assistant-local", ...(await listTasks(ctx)) };
  },
});
