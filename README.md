# Agent bots

Each sibling of `cursor-agent-template` that has its own `package.json` is another bot. `agent-sdk serve` from this folder mounts all of them, and each bot's cron runs in that process.

```bash
cp -R cursor-agent-template my-bot
```

Name the copy whatever the new bot is, then in that copy:

1. Set `name` in `package.json`.
2. Set `botName` in `bot/agent.js`.
3. Replace `bot/instructions.md`.

`npm install` from this repo picks up any new top-level package. Run one bot's interactive CLI with `npm start` inside its directory. `npm start` from here starts the template.
