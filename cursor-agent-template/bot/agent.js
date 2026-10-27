import { homedir } from "node:os";
import { join } from "node:path";
import { defineAgent } from "@grok/agent-sdk";

// Display name. The CLI prints this. Change it when you copy the template.
export const botName = "Cursor Agent";

// Keep harness cwd outside the monorepo. Change the last segment when you copy.
const harnessCwd = join(homedir(), ".cache", "agent-serve", "cursor-agent-template");

export default defineAgent({
  name: botName,
  description: "Template Cursor agent. Copy this project to start a new bot.",
  model: {
    id: "grok-4.5",
    params: [
      { id: "effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  local: { cwd: harnessCwd },
  // reminders_list and reminders_cancel, plus delay/every wakes.
  // schedule_wakeup adds cron on the same conversation.
  builtinTools: { reminders: true },
});
