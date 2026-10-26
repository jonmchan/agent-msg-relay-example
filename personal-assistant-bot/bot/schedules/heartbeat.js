import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  cron: "0 9 * * 1-5",
  markdown: [
    "Scheduled personal task check.",
    "Call list_tasks, then summarize open tasks in a few bullets.",
    "If the list is empty, say so in one sentence and stop.",
  ].join("\n"),
});
