import { defineAgent } from "@grok/agent-sdk";

export const botName = "Personal Assistant";

export default defineAgent({
  name: botName,
  description: "Lists and summarizes tasks on its own local list.",
  model: {
    id: "grok-4.5",
    params: [
      { id: "effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  builtinTools: { reminders: true },
});
