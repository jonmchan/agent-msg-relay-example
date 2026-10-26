import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import wakeup from "../reminders/wakeup.js";

const scheduleField = z.string().min(1).optional();

export default defineTool({
  description:
    "Arm a wakeup on this conversation so you run again after this turn ends. Pass exactly one of cron (5-field UTC), delay (for example 20m or 2h), or every (for example 30m). The wakeup stays armed across restarts.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("What to do when you wake. Keep it generic and re-read live state on wake."),
    cron: scheduleField.describe('5-field cron in UTC, for example "0 9 * * 1-5".'),
    delay: scheduleField.describe('One-shot delay, for example "20m" or "2h".'),
    every: scheduleField.describe('Interval, for example "30m". Minimum 1m.'),
    purpose: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('Short slug for this wakeup, for example "ci_recheck". Defaults to "wakeup".'),
    until: z
      .string()
      .min(1)
      .optional()
      .describe("When to stop a recurring wakeup, in plain language."),
  }),
  async execute(input, ctx) {
    const chosen = ["cron", "delay", "every"].filter((key) => input[key] !== undefined);
    if (chosen.length !== 1) {
      throw new Error("Provide exactly one of cron, delay, or every.");
    }

    const continuationToken = ctx.session.continuationKey;
    if (continuationToken == null || continuationToken === "") {
      throw new Error("This session cannot be woken later.");
    }

    const reminders = ctx.host.reminders;
    if (reminders === undefined) {
      throw new Error("The reminder scheduler is not running on this host.");
    }

    const reminder = await reminders.create({
      purpose: input.purpose ?? "wakeup",
      channelId: ctx.session.channelId,
      continuationToken,
      handler: wakeup,
      args: {
        prompt: input.prompt,
        ...(input.until === undefined ? {} : { until: input.until }),
      },
      ...(input.cron === undefined ? {} : { cron: input.cron }),
      ...(input.delay === undefined ? {} : { delay: input.delay }),
      ...(input.every === undefined ? {} : { every: input.every }),
    });

    return {
      reminderId: reminder.id,
      purpose: reminder.purpose,
      schedule: `${reminder.scheduleKind} ${reminder.scheduleValue}`,
      nextFireAt: reminder.nextFireAt,
    };
  },
});
