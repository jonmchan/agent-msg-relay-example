import { defineReminder } from "@grok/agent-sdk/reminders";

// Runs on the host when a conversation wakeup fires, then wakes the model.
export default defineReminder({
  async run({ args, followup }) {
    const prompt = typeof args.prompt === "string" ? args.prompt : "Scheduled wakeup.";
    const until = typeof args.until === "string" ? ` Stop when: ${args.until}` : "";
    await followup({
      message: `${prompt}${until} This is a wakeup, not a new user message. Re-read live state. If the stop condition is already met, call reminders_cancel for this reminder and do nothing else.`,
    });
    return { action: "delivered" };
  },
});
