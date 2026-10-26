import { defineSchedule } from "@grok/agent-sdk/schedules";

export default defineSchedule({
  cron: "0 9 * * 1-5",
  markdown: [
    "Scheduled fridge check.",
    "Call list_tasks. If any open items remain, say the count and the top few titles in one short reply.",
    "If the list is empty, say so in one sentence and stop.",
  ].join("\n"),
});
