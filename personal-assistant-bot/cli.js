#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { clearLine, cursorTo, createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@grok/agent-sdk";
import { silenceOtelDoubleEndNoise } from "./silence-otel-noise.js";

silenceOtelDoubleEndNoise();

const root = dirname(realpathSync(fileURLToPath(import.meta.url)));
const stateRoot = join(root, ".agent-serve");
const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
const paint = (code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = (text) => paint("1", text);
const dim = (text) => paint("2", text);
const cyan = (text) => paint("36", text);
const green = (text) => paint("32", text);
const red = (text) => paint("31", text);
const magenta = (text) => paint("35", text);

// One process, one state root, this bot only — never the monorepo parent.
const handle = await serve(root, {
  port: 0,
  host: "127.0.0.1",
  dev: false,
  schedules: true,
  reminders: true,
  docs: false,
  mode: "single",
  stateRoot,
});

const mount = handle.agents[0];
const botName = mount?.info.name ?? "Personal Assistant";
const baseUrl = (mount?.url ?? handle.url).replace(/\/$/, "");
const abort = new AbortController();

let sessionId;
let continuationToken;
let nextIndex = 0;
let assistantOpen = false;
let promptVisible = false;
let turnOpen = false;
let localSend = false;
let shuttingDown = false;
let saidBye = false;

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdin.isTTY === true,
});
rl.setPrompt(`${cyan(botName)} › `);

function write(text) {
  process.stdout.write(text);
}

function beginOutput() {
  if (!promptVisible) {
    return;
  }
  clearLine(process.stdout, 0);
  cursorTo(process.stdout, 0);
  promptVisible = false;
}

function showPrompt() {
  if (shuttingDown || turnOpen) {
    return;
  }
  rl.prompt(true);
  promptVisible = true;
}

function closeAssistant() {
  if (!assistantOpen) {
    return;
  }
  write("\n");
  assistantOpen = false;
}

function truncate(text, max) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function formatArgs(args) {
  if (args === undefined || args === null) {
    return "";
  }
  const text = typeof args === "string" ? args : JSON.stringify(args);
  return text === "{}" ? "" : `(${truncate(text, 80)})`;
}

function stringify(value) {
  if (value === undefined || value === null) {
    return "(no output)";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function requestJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: abort.signal,
  });
  const text = await response.text();
  let parsed = {};
  if (text !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }
  if (!response.ok || parsed.ok === false) {
    const message = typeof parsed.message === "string" ? parsed.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

function render(event) {
  if (event.type === "message.received") {
    if (localSend) {
      localSend = false;
      return;
    }
    beginOutput();
    const text = typeof event.data?.text === "string" ? event.data.text : "";
    write(`${dim("wakeup")}  ${text}\n`);
    return;
  }

  if (event.type === "message.appended") {
    if (event.data?.parentCallId !== undefined) {
      return;
    }
    beginOutput();
    if (!assistantOpen) {
      write(`${green(`‹ ${botName}`)}  `);
      assistantOpen = true;
    }
    write(typeof event.data?.delta === "string" ? event.data.delta : "");
    return;
  }

  if (event.type === "message.completed") {
    if (event.data?.parentCallId !== undefined) {
      return;
    }
    closeAssistant();
    return;
  }

  if (event.type === "actions.requested") {
    closeAssistant();
    beginOutput();
    const calls = Array.isArray(event.data?.calls) ? event.data.calls : [];
    for (const call of calls) {
      write(`  ${magenta("⚙")} ${bold(String(call.toolName))}${dim(formatArgs(call.args))}\n`);
    }
    return;
  }

  if (event.type === "action.result") {
    beginOutput();
    const label = event.data?.isError === true ? red("✗") : magenta("→");
    write(`    ${label} ${dim(truncate(stringify(event.data?.output), 120))}\n`);
    return;
  }

  if (event.type === "turn.completed") {
    closeAssistant();
    beginOutput();
    write(dim("  ─ turn done\n"));
    return;
  }

  if (event.type === "turn.failed") {
    closeAssistant();
    beginOutput();
    const message = typeof event.data?.message === "string" ? event.data.message : "turn failed";
    write(`${red("  ✗")} ${message}\n`);
  }
}

function noteIndex(event) {
  if (typeof event.index === "number") {
    nextIndex = event.index + 1;
  }
}

function onSessionSettled() {
  closeAssistant();
  turnOpen = false;
  if (!shuttingDown) {
    rl.resume();
    showPrompt();
  }
}

async function followSession(id) {
  while (!abort.signal.aborted) {
    let response;
    try {
      response = await fetch(`${baseUrl}/v1/session/${id}/stream?startIndex=${nextIndex}`, {
        signal: abort.signal,
      });
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      beginOutput();
      write(`${red("error")} ${error instanceof Error ? error.message : String(error)}\n`);
      await delay(1000);
      continue;
    }

    if (!response.ok || response.body === null) {
      beginOutput();
      write(`${red("error")} stream failed (${response.status})\n`);
      await delay(1000);
      continue;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let stop = false;

    while (!stop) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event === null || typeof event !== "object" || typeof event.type !== "string") {
          continue;
        }
        noteIndex(event);
        if (event.type === "turn.started" || event.type === "message.received") {
          turnOpen = true;
          rl.pause();
        }
        render(event);
        if (event.type === "session.waiting") {
          onSessionSettled();
        }
        if (event.type === "session.completed" || event.type === "session.failed") {
          onSessionSettled();
          stop = true;
        }
      }
    }

    if (stop || abort.signal.aborted) {
      return;
    }
  }
}

async function send(message) {
  localSend = true;
  if (sessionId === undefined) {
    const created = await requestJson("/v1/session", { message });
    sessionId = created.sessionId;
    continuationToken = created.continuationToken;
    if (typeof sessionId !== "string" || sessionId === "") {
      throw new Error("server did not return a session id");
    }
    void followSession(sessionId);
    return;
  }

  const response = await requestJson(`/v1/session/${sessionId}`, {
    message,
    continuationToken,
  });
  if (typeof response.continuationToken === "string") {
    continuationToken = response.continuationToken;
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  abort.abort();
  rl.close();
  await handle.close();
}

write(`${bold(botName)}\n`);
for (const schedule of mount?.info.schedules ?? []) {
  write(`${dim("cron")}  ${schedule.name}  ${schedule.cron}\n`);
}
write(`${dim(baseUrl)}\n`);
write(dim("Type a message and press Enter. /clear resets the screen. Ctrl-D or /quit to exit.\n\n"));
showPrompt();

rl.on("line", (line) => {
  const text = line.trim();
  promptVisible = false;
  if (text === "") {
    showPrompt();
    return;
  }
  if (text === "/quit" || text === "/exit") {
    rl.close();
    return;
  }
  if (text === "/clear" || text === "/reset") {
    write("\u001b[2J\u001b[H");
    write(`${bold(botName)}\n`);
    write(dim("Type a message and press Enter. /clear resets the screen. Ctrl-D or /quit to exit.\n\n"));
    showPrompt();
    return;
  }
  if (turnOpen) {
    write(dim("Still working on the current turn.\n"));
    showPrompt();
    return;
  }

  turnOpen = true;
  rl.pause();
  send(text).catch((error) => {
    localSend = false;
    turnOpen = false;
    write(`${red("error")} ${error instanceof Error ? error.message : String(error)}\n`);
    rl.resume();
    showPrompt();
  });
});

rl.on("close", () => {
  if (!saidBye) {
    saidBye = true;
    write(dim("\nbye\n"));
  }
  shutdown().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
