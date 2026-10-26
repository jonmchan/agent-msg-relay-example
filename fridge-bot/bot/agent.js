import { defineAgent } from "@grok/agent-sdk";

export const botName = "Fridge Bot";

export default defineAgent({
  name: botName,
  description: "Collects grocery and restock tasks on a local fridge list.",
  model: {
    id: "grok-4.5",
    params: [
      { id: "effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  builtinTools: { reminders: true },
});
