# Agent bots

Independent Cursor agent bots in one repo. Each bot is its own package, process, state root, and harness cwd. Do not run `agent-sdk serve` from this repo root — that would mount every bot in one process.

| Package | Role |
| --- | --- |
| `cursor-agent-template` | Blank bot to copy |
| `fridge-bot` | Collects grocery / restock tasks on its own list |
| `personal-assistant-bot` | Lists and summarizes its own task list |

## Run (two terminals)

```bash
npm install
npx agent-sdk login

# Terminal A — fridge only
npm start -w fridge-bot

# Terminal B — personal assistant only
npm start -w personal-assistant-bot
```

Each CLI serves **only that bot**:

- state: `<bot>/.agent-serve`
- harness cwd: `~/.cache/agent-serve/<bot-package-name>`
- task KV: separate per bot

## Baseline demo

1. Fridge: add milk, eggs, butter. Ask what is on the fridge list.
2. Assistant: add a couple personal to-dos. Ask for a summary.
3. Confirm each list stays private to that bot.
4. Reset before the next run:

```bash
npm run reset-demo
```

That wipes each bot’s local runtime (`.agent-serve` sessions, runner DBs, reminders, task KV), the isolated harness caches under `~/.cache/agent-serve/<bot>`, and agent-msg-relay skill/config (`.agents`, `bot/skills/agent-msg-relay`, `.agent-msg`, relay `bin/`, `skills-lock.json` entry, `AGENTS.md` relay block) from the repo root and every bot package. Restart the CLIs after resetting.

## Automated relay demo

End-to-end check of skill install → Personal Assistant receive/register/profile/share → Fridge apply share/address book → Fridge posts a task → Personal Assistant inbox → local task list:

```bash
npx agent-sdk login   # once; model turns need a Cursor credential
npm run demo:test
```

The script resets first, runs `npx skills add` per bot (then overlays `../agent-msg-relay/.agents/skills/agent-msg-relay` when that tree exists, so behavior matches the skill source of truth), copies `bin/`, boots each bot with `agent-sdk serve` (durable host KV), and drives live initiation prompts only — bot `instructions.md` files stay free of agent-msg-relay rules. Exit `1` on any failed assertion.

## Copy another bot

```bash
cp -R cursor-agent-template my-bot
```

Then set `name` in `package.json`, `botName` / harness cwd in `bot/agent.js`, and rewrite `bot/instructions.md`. Add the package name to the root `workspaces` list.
