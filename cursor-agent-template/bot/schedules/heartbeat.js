import { defineSchedule } from "@grok/agent-sdk/schedules";

// Fires on this cron while the bot is served (including `npm start`).
// Each fire is its own task. It does not continue the CLI conversation.
export default defineSchedule({
  cron: "0 9 * * 1-5",
  markdown: [
    "Scheduled wakeup. Nobody is waiting on a reply in this run.",
    "Look for follow-up you still owe. If nothing is open, say so in one sentence and stop.",
  ].join("\n"),
});
