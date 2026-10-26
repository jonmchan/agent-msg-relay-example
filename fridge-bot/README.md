# Fridge Bot

Collects grocery and restock tasks on a **local** list. Nothing else reads this list unless you wire that up later.

```bash
npm start -w fridge-bot
```

Or from this directory: `npm start`.

## Tools

| Tool | Role |
| --- | --- |
| `add_task` | Append to the fridge list |
| `list_tasks` | Show open and done fridge tasks |
| `complete_task` | Mark one fridge task done |
| `delete_task` | Remove one fridge task by id |
| `clear_tasks` | Wipe the list (`all`, `open`, or `done`) |

Tasks live in this bot's host KV under key `tasks`.

## Try it

```text
We're out of milk and eggs. Also restock butter.
What's on the fridge list?
```
