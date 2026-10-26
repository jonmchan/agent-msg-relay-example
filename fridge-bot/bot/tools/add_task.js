import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { addTask } from "../lib/tasks.js";

export default defineTool({
  description:
    "Add a task to this fridge bot's local list. Use for groceries, restocks, leftovers to finish, or fridge chores.",
  effect: "write",
  inputSchema: z.object({
    title: z.string().min(1).describe("Short task title, for example 'Buy milk'."),
    notes: z.string().optional().describe("Optional detail, brand, quantity, or shelf."),
  }),
  async execute({ title, notes }, ctx) {
    const task = await addTask(ctx, { title, notes, source: "fridge" });
    return { task, list: "fridge-local" };
  },
});
