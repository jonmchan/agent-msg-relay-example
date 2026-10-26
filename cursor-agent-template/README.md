# cursor-agent-template

Copy this directory to make another bot. The interactive CLI prints `botName` from `bot/agent.js`.

```bash
npm install
npm start
```

`npm start` serves this bot with cron and conversation wakeups armed, then opens the CLI. `npm run dev` is the local playground and does not fire schedules on its own.

Sign in once so model turns can run: `npx agent-sdk login`.

## Where to edit

| Path | What it is |
| --- | --- |
| `bot/agent.js` | Name, model, and harness config |
| `bot/instructions.md` | Always-on prompt |
| `bot/schedules/` | Cron that starts work with no one in the CLI |
| `bot/reminders/wakeup.js` | What a conversation wakeup says when it fires |
| `bot/tools/schedule_wakeup.js` | Tool the bot calls to arm a cron, delay, or interval wakeup |

After copying, change `name` in `package.json` and `botName` in `bot/agent.js`, then rewrite `bot/instructions.md`.
