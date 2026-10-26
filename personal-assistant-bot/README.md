# Personal Assistant

Lists and summarizes tasks on its **own** local list. It does not see Fridge Bot's list unless you wire that up later.

```bash
npm start -w personal-assistant-bot
```

Or from this directory: `npm start`.

## Tools

| Tool | Role |
| --- | --- |
| `list_tasks` | Load open and done tasks before summarizing |
| `add_task` | Add a personal to-do to this list |
| `complete_task` | Mark one local task done |
| `delete_task` | Remove one task by id |
| `clear_tasks` | Wipe the list (`all`, `open`, or `done`) |

Tasks live in this bot's host KV under key `tasks`.

## Try it

```text
Add: email the landlord, and pick up dry cleaning.
What do I have to do? Summarize it.
```
