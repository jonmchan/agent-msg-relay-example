import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineAgent } from "@grok/agent-sdk";

export const botName = "Fridge Bot";

// This package root holds .agent-msg/, bin/, and .agents/ for agent-msg-relay.
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
  local: { workspaceDir: packageRoot },
  builtinTools: { reminders: true },
});
