# Agent bots

Monorepo of Cursor agent bots. Each top-level package with a `package.json` is one bot.

| Package | Role |
| --- | --- |
| `cursor-agent-template` | Blank bot to copy |
| `fridge-bot` | Collects grocery / restock tasks on its own list |
| `personal-assistant-bot` | Lists and summarizes its own task list |

The two example bots start with **independent** task stores. Add milk on the fridge bot and it will not appear on the personal assistant until you connect them yourself.

## Run

```bash
npm install
npx agent-sdk login

# Terminal A
npm start -w fridge-bot

# Terminal B
npm start -w personal-assistant-bot
```

Suggested demo before any cross-bot wiring:

1. On Fridge Bot: add milk, eggs, butter. Ask what is on the fridge list.
2. On Personal Assistant: add a couple personal to-dos. Ask for a summary.
3. Confirm each bot only sees its own list.
4. Reset with “clear all tasks” on each bot (`clear_tasks`) before the next run.

## Copy another bot

```bash
cp -R cursor-agent-template my-bot
```

Then set `name` in `package.json`, `botName` in `bot/agent.js`, and rewrite `bot/instructions.md`.
