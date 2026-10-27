import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineAgent } from "@grok/agent-sdk";

export const botName = "Personal Assistant";

// This package root holds .agent-msg/, bin/, and .agents/ for agent-msg-relay.
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
  local: { workspaceDir: packageRoot },
  builtinTools: { reminders: true },
});
