#!/usr/bin/env node
/**
 * End-to-end demo test for fridge-bot ↔ personal-assistant-bot via agent-msg-relay.
 *
 * Steps:
 *  1. reset-demo + install skill (npx skills add) + copy bin into each bot
 *  2. Personal Assistant: receive-tasks prompt (live model turn)
 *  3. Assert PA registration, profile, schedule, share blurb
 *  4. Fridge: apply share paste (live model turn)
 *  5. Assert fridge registration + address book
 *  6. Fridge: create a task (live model turn) → should post to PA
 *  7. PA: inbox / process tasks (live model turn)
 *  8. Assert PA task list contains the fridge task
 *
 * Requires a Cursor credential for model turns (CURSOR_API_KEY or `agent-sdk login`).
 */
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { agentMsg, fridgeDir, paDir, relayBinary, relayBinaryRel, root } from "./lib/demo-paths.mjs";
import { assertShareBlurbShape, buildShareBlurb } from "./lib/share-blurb.mjs";

const TURN_TIMEOUT_MS = Number(process.env.DEMO_TURN_TIMEOUT_MS ?? 300_000);
const TASK_TEXT = "Buy oat milk for the demo";
const SKILL_SOURCE = "https://github.com/jonmchan/agent-msg-relay";
const PA_PORT = Number(process.env.DEMO_PA_PORT ?? 3111);
const FRIDGE_PORT = Number(process.env.DEMO_FRIDGE_PORT ?? 3112);
const failures = [];
const steps = [];
const children = [];

const urls = {
  pa: `http://127.0.0.1:${PA_PORT}`,
  fridge: `http://127.0.0.1:${FRIDGE_PORT}`,
};

function log(message) {
  console.log(message);
}

function pass(name, detail = "") {
  const line = detail ? `PASS  ${name} — ${detail}` : `PASS  ${name}`;
  steps.push({ name, ok: true, detail });
  log(line);
}

function fail(name, detail) {
  steps.push({ name, ok: false, detail });
  failures.push(`${name}: ${detail}`);
  log(`FAIL  ${name} — ${detail}`);
}

function assert(name, condition, onFail, onPass = "") {
  if (condition) {
    pass(name, onPass);
  } else {
    fail(name, typeof onFail === "string" ? onFail : "assertion failed");
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tryReadJson(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  return readJson(path);
}

function run(command, args, options = {}) {
  const { cwd = root, env = process.env, input, timeoutMs = 120_000 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function runChecked(command, args, options = {}) {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}

function extractJsonDocument(text) {
  // agent-sdk may print INFO lines on stdout before a pretty-printed JSON document.
  // Those log lines contain `{...}` fragments that are not valid JSON objects.
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimStart() !== "{" && !lines[i].trimStart().startsWith('{"')) {
      continue;
    }
    const candidate = lines.slice(i).join("\n").trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // keep scanning for a later object
    }
  }
  throw new Error(`No JSON object in output:\n${text.slice(0, 1000)}`);
}

function finalAssistantText(result) {
  const traj = result.trajectory;
  if (typeof traj === "string") {
    return traj;
  }
  if (traj && typeof traj === "object") {
    if (typeof traj.finalText === "string" && traj.finalText.trim() !== "") {
      return traj.finalText;
    }
    if (Array.isArray(traj.turns)) {
      return traj.turns
        .map((turn) => (typeof turn?.assistantText === "string" ? turn.assistantText : ""))
        .filter(Boolean)
        .join("\n");
    }
  }
  if (typeof result.reply === "string") {
    return result.reply;
  }
  return "";
}

function trajectoryText(result) {
  // User-facing text only. Tool args/outputs may legitimately read identity.json.
  return finalAssistantText(result);
}

async function agentRun(projectDir, message, baseUrl) {
  const args = [
    "agent-sdk",
    "run",
    "--dir",
    projectDir,
    "--message",
    message,
    "--json",
    "--no-stream",
    "--timeout-ms",
    String(TURN_TIMEOUT_MS),
  ];
  if (baseUrl) {
    args.push("--url", baseUrl);
  }
  const result = await run("npx", args, { cwd: root, timeoutMs: TURN_TIMEOUT_MS + 30_000 });
  if (result.code !== 0) {
    throw new Error(
      `agent-sdk run failed in ${projectDir} (exit ${result.code})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return extractJsonDocument(result.stdout);
}

async function toolCall(projectDir, tool, input, baseUrl) {
  const args = [
    "agent-sdk",
    "tool",
    "call",
    tool,
    "--dir",
    projectDir,
    "--input",
    JSON.stringify(input),
    "--json",
  ];
  if (baseUrl) {
    args.push("--url", baseUrl);
  }
  const result = await runChecked("npx", args, { cwd: root, timeoutMs: 60_000 });
  return extractJsonDocument(result.stdout);
}

function startServe(projectDir, port) {
  const child = spawn(
    "npx",
    [
      "agent-sdk",
      "serve",
      "--dir",
      projectDir,
      "--mode",
      "single",
      "--dev",
      "--port",
      String(port),
      "--no-playground",
      "--no-docs",
    ],
    {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}

async function waitForHealth(baseUrl, timeoutMs = 60_000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/v1/info`);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${baseUrl} did not become healthy: ${lastError}`);
}

function stopServes() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function resetDemo() {
  await runChecked("npm", ["run", "reset-demo"], { cwd: root, timeoutMs: 60_000 });
}

function localSkillSource() {
  const fromEnv = process.env.AGENT_MSG_RELAY_SKILL_SRC;
  if (fromEnv && existsSync(join(fromEnv, "SKILL.md"))) {
    return fromEnv;
  }
  const sibling = join(root, "..", "agent-msg-relay", ".agents", "skills", "agent-msg-relay");
  if (existsSync(join(sibling, "SKILL.md"))) {
    return sibling;
  }
  return undefined;
}

async function installSkill(projectDir) {
  // #1: validate `npx skills add` from the published source.
  await runChecked(
    "npx",
    ["skills", "add", SKILL_SOURCE, "--skill", "agent-msg-relay", "-y", "--copy"],
    { cwd: projectDir, timeoutMs: 180_000 },
  );
  const skillDir = join(projectDir, ".agents", "skills", "agent-msg-relay");
  assert(
    "skill installed under .agents",
    existsSync(join(skillDir, "SKILL.md")),
    `missing ${skillDir}`,
    skillDir,
  );

  // Prefer the local skill source of truth when present (published GitHub can lag).
  // Behavior must come from the skill, not from demo bot instructions.
  const local = localSkillSource();
  if (local) {
    rmSync(skillDir, { recursive: true, force: true });
    cpSync(local, skillDir, { recursive: true });
    pass("skill overlaid from local source", local);
  }

  // Agent SDK discovers bot/skills/<name>/SKILL.md.
  const botSkill = join(projectDir, "bot", "skills", "agent-msg-relay");
  mkdirSync(dirname(botSkill), { recursive: true });
  rmSync(botSkill, { recursive: true, force: true });
  cpSync(skillDir, botSkill, { recursive: true });
  assert(
    "skill mirrored into bot/skills",
    existsSync(join(botSkill, "SKILL.md")),
    `missing ${botSkill}`,
    botSkill,
  );
}

async function ensureBin(projectDir) {
  const targetBin = join(projectDir, "bin");
  if (existsSync(join(projectDir, relayBinaryRel()))) {
    pass("bin already present", projectDir);
    return;
  }

  const staging = mkdtempSync(join(tmpdir(), "amr-bin-"));
  try {
    await runChecked(
      "git",
      ["clone", "--depth", "1", "--filter=blob:none", "--sparse", `${SKILL_SOURCE}.git`, staging],
      { timeoutMs: 180_000 },
    );
    await runChecked("git", ["sparse-checkout", "set", "bin"], { cwd: staging, timeoutMs: 60_000 });
    rmSync(targetBin, { recursive: true, force: true });
    cpSync(join(staging, "bin"), targetBin, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  const absolute = relayBinary(projectDir);
  chmodSync(absolute, 0o755);
  const version = await runChecked(absolute, ["--version"], { cwd: projectDir });
  assert(
    "bin --version",
    version.stdout.includes("agent-msg-relay"),
    version.stdout.trim(),
    version.stdout.trim(),
  );
}

function extractShareBlock(text) {
  const marker = "Install the agent-msg-relay skill.";
  const start = text.indexOf(marker);
  if (start < 0) {
    return undefined;
  }
  // Prefer a fenced code block containing the marker.
  const fenceStart = text.lastIndexOf("```", start);
  if (fenceStart >= 0) {
    const afterFence = text.indexOf("\n", fenceStart);
    const fenceEnd = text.indexOf("```", afterFence + 1);
    if (afterFence >= 0 && fenceEnd > afterFence) {
      const block = text.slice(afterFence + 1, fenceEnd).trim();
      if (block.includes(marker)) {
        return `${block}\n`;
      }
    }
  }
  const endMarkers = ["Give this to the other agent", "\n## ", "\n### "];
  let end = text.length;
  for (const em of endMarkers) {
    const idx = text.indexOf(em, start + marker.length);
    if (idx > start && idx < end) {
      end = idx;
    }
  }
  return `${text.slice(start, end).trim()}\n`;
}

function profileOf(projectDir) {
  return tryReadJson(agentMsg(projectDir, "profile.json"));
}

function listOpenTitles(listResult) {
  const payload = listResult?.result ?? listResult ?? {};
  const open = payload.open ?? [];
  return open.map((task) => String(task.title ?? ""));
}

function assertNoSecretLeak(label, text, identityFile) {
  if (!text) {
    return;
  }
  const forbidden = [];
  if (identityFile?.token && text.includes(identityFile.token)) {
    forbidden.push("token");
  }
  if (identityFile?.private_key && text.includes(identityFile.private_key)) {
    forbidden.push("private_key");
  }
  assert(`${label}: no identity secrets in text`, forbidden.length === 0, forbidden.join(", "));
}

async function stepInstall() {
  log("\n== 1. Install agent-msg-relay ==");
  await resetDemo();
  for (const dir of [paDir, fridgeDir]) {
    await installSkill(dir);
    await ensureBin(dir);
  }
}

async function stepPersonalAssistantReceives() {
  log("\n== 2. Personal Assistant: receive tasks ==");
  // Initiation only — no relay rules in bot/instructions.md.
  const prompt = [
    "Use the agent-msg-relay skill.",
    "Listen for tasks from other agents.",
    "Call yourself personal-assistant-bot on that network.",
    "Check the inbox on a schedule if this process has one, and not on every turn.",
    "Print the share handoff for the other agent when you are done.",
  ].join(" ");

  const turn = await agentRun(paDir, prompt, urls.pa);
  assert(
    "PA turn succeeded",
    turn.ok !== false,
    JSON.stringify({ ok: turn.ok, sessionId: turn.sessionId }),
    turn.sessionId ?? "",
  );

  const identityFile = tryReadJson(agentMsg(paDir, "identity.json"));
  const identity = identityFile?.identity;
  assert(
    "PA registered identity.json",
    typeof identity === "string" && identity.startsWith("0x"),
    String(identity),
    String(identity),
  );
  assert("PA identity has token field", typeof identityFile?.token === "string" && identityFile.token.length > 0);

  const profile = profileOf(paDir);
  assert("PA wrote profile.json", profile !== undefined, "missing profile.json");
  if (profile) {
    const name = String(profile.name ?? "");
    assert(
      "PA profile name is personal-assistant-bot",
      /personal[\s_-]*assistant/i.test(name),
      `name=${JSON.stringify(name)}`,
      `name=${JSON.stringify(name)}`,
    );
    const consumes = Array.isArray(profile.consumes) ? profile.consumes : [];
    assert(
      "PA consumes includes task",
      consumes.some((entry) => entry.type === "task"),
      JSON.stringify(consumes),
    );
    assert(
      "PA consumes has when clause",
      consumes.some((entry) => typeof entry.when === "string" && entry.when.length > 0),
      JSON.stringify(consumes),
    );
  }

  const consent = tryReadJson(agentMsg(paDir, "consent.json"));
  assert(
    "PA consent accepted startup files",
    consent?.startup_files === "accepted",
    JSON.stringify(consent),
  );

  const agentsMd = existsSync(join(paDir, "AGENTS.md")) ? readFileSync(join(paDir, "AGENTS.md"), "utf8") : "";
  assert(
    "PA AGENTS.md has startup section",
    agentsMd.includes("<!-- agent-msg-relay -->") && agentsMd.includes("<!-- /agent-msg-relay -->"),
    "missing <!-- agent-msg-relay --> markers",
  );

  const schedule = tryReadJson(agentMsg(paDir, "schedule.json"));
  if (schedule?.mode === "scheduled") {
    assert(
      "PA schedule interval set",
      typeof schedule.interval === "string" && schedule.interval.length > 0,
      JSON.stringify(schedule),
      schedule.interval,
    );
    assert(
      "PA schedule via known listener",
      ["cloud-timer", "session-loop", "repo-scheduler"].includes(schedule.via),
      JSON.stringify(schedule),
      schedule.via,
    );
  } else {
    // Per listen.md: without a timer/scheduler, mode stays turn (or file absent).
    // Agent SDK exposes schedule_wakeup / reminders — prefer scheduled when the model arms one.
    pass("PA inbox listener is turn-based (no host scheduler)", JSON.stringify(schedule ?? null));
  }

  const text = trajectoryText(turn);
  assertNoSecretLeak("PA reply", text, identityFile);

  let share = extractShareBlock(text);
  if (!share && profile && identity) {
    // Fall back to oracle blurb when the model wrote the profile but omitted a fenced paste.
    share = buildShareBlurb({
      identity,
      purpose: profile.purpose ?? "an agent that receives tasks",
      name: profile.name,
      consumes: profile.consumes ?? [],
      source: SKILL_SOURCE,
    });
    fail("PA printed share blurb in reply", "missing Install the agent-msg-relay skill. in trajectory; using oracle blurb from profile");
  } else if (share) {
    pass("PA printed share blurb in reply");
  }

  if (share && identity) {
    try {
      assertShareBlurbShape(share, { identity, type: "task" });
      pass("PA share blurb shape", "required fragments present");
    } catch (error) {
      fail("PA share blurb shape", error instanceof Error ? error.message : String(error));
    }
    assert("PA share blurb includes identity", share.includes(identity));
    assertNoSecretLeak("PA share blurb", share, identityFile);
  }

  return { identity, profile, share, turnText: text, sessionId: turn.sessionId };
}

async function stepFridgeAppliesShare(share, paIdentity) {
  log("\n== 3. Fridge Bot: apply share paste ==");
  if (!share) {
    fail("Fridge share paste available", "no share blurb from PA step");
    return {};
  }

  // Operator pastes the consumer handoff; skill + paste own the protocol.
  const prompt = ["Follow this handoff from the Personal Assistant:", "", share].join("\n");

  const turn = await agentRun(fridgeDir, prompt, urls.fridge);
  assert("Fridge turn succeeded", turn.ok !== false);

  const identityFile = tryReadJson(agentMsg(fridgeDir, "identity.json"));
  const identity = identityFile?.identity;
  assert(
    "Fridge registered identity.json",
    typeof identity === "string" && identity.startsWith("0x"),
    String(identity),
    String(identity),
  );

  const book = tryReadJson(agentMsg(fridgeDir, "address-book.json"));
  const entries = Array.isArray(book) ? book : Object.entries(book ?? {}).map(([id, entry]) => ({ agent: id, ...(entry ?? {}) }));
  const remembered = entries.some((entry) => {
    const name = String(entry?.name ?? entry?.target_name ?? "");
    const idMatch =
      paIdentity &&
      (entry?.agent === paIdentity || entry?.sender === paIdentity || entry?.identity === paIdentity);
    return idMatch || /personal[\s_-]*assistant/i.test(name);
  });
  assert(
    "Fridge address book remembers personal assistant",
    remembered,
    JSON.stringify(book),
    paIdentity ?? "",
  );

  const agentsMd = existsSync(join(fridgeDir, "AGENTS.md")) ? readFileSync(join(fridgeDir, "AGENTS.md"), "utf8") : "";
  assert(
    "Fridge did not install consumer inbox startup",
    !agentsMd.includes("<!-- agent-msg-relay -->"),
    "AGENTS.md has consumer startup markers",
  );

  assertNoSecretLeak("Fridge reply", trajectoryText(turn), identityFile);

  return { identity, turnText: trajectoryText(turn), sessionId: turn.sessionId };
}

async function stepFridgeCreatesTask(paIdentity) {
  log("\n== 4. Fridge Bot: create task and send ==");
  const beforeOutbox = existsSync(agentMsg(fridgeDir, "outbox.jsonl"))
    ? readFileSync(agentMsg(fridgeDir, "outbox.jsonl"), "utf8")
    : "";

  const turn = await agentRun(
    fridgeDir,
    [
      `Add "${TASK_TEXT}" to the fridge list, and send that same task to the Personal Assistant`,
      paIdentity ? `(${paIdentity})` : "",
      "so they can track it too.",
    ]
      .filter(Boolean)
      .join(" "),
    urls.fridge,
  );
  assert("Fridge task turn succeeded", turn.ok !== false);

  const text = trajectoryText(turn);
  const list = await toolCall(fridgeDir, "list_tasks", {}, urls.fridge);
  const titles = listOpenTitles(list);
  const listedLocally = titles.some((title) => /oat milk/i.test(title));
  assert(
    "Fridge local list has the new task",
    listedLocally,
    JSON.stringify({ titles }),
    titles.join(", "),
  );

  const afterOutbox = existsSync(agentMsg(fridgeDir, "outbox.jsonl"))
    ? readFileSync(agentMsg(fridgeDir, "outbox.jsonl"), "utf8")
    : "";
  const outboxGrew = afterOutbox.length > beforeOutbox.length;
  const trajBlob = JSON.stringify(turn.trajectory ?? {});
  const postedTask =
    outboxGrew ||
    afterOutbox.includes("\"type\":\"task\"") ||
    /message-type\s+task/.test(text) ||
    /--message-type["\s:=]+task/.test(trajBlob) ||
    /post\s+--agent/.test(trajBlob);
  assert("Fridge sent a task over agent-msg-relay", postedTask, "outbox/trajectory show no task post");

  return { turnText: text, sessionId: turn.sessionId };
}

async function stepPersonalAssistantIngests() {
  log("\n== 5. Personal Assistant: receive + add task ==");
  const before = await toolCall(paDir, "list_tasks", {}, urls.pa);
  const beforeTitles = listOpenTitles(before);

  const turn = await agentRun(
    paDir,
    "Check your inbox now and handle anything new. Then list your tasks.",
    urls.pa,
  );
  assert("PA inbox turn succeeded", turn.ok !== false);

  const queuePath = agentMsg(paDir, "queue.jsonl");
  if (existsSync(queuePath)) {
    const queue = readFileSync(queuePath, "utf8");
    assert(
      "PA queue recorded a task",
      queue.includes("\"type\":\"task\"") || /oat milk/i.test(queue),
      queue.slice(0, 400),
      "task line present",
    );
  } else {
    pass("PA queue.jsonl optional", "missing; agent may have applied without queuing");
  }

  const after = await toolCall(paDir, "list_tasks", {}, urls.pa);
  const afterTitles = listOpenTitles(after);
  const listed = afterTitles.some((title) => /oat milk/i.test(title));
  assert(
    "PA task list includes fridge task",
    listed,
    JSON.stringify({ beforeTitles, afterTitles }),
    afterTitles.join(", "),
  );

  return { turnText: trajectoryText(turn), afterTitles };
}

async function main() {
  log("Demo test starting…");
  if (!process.env.CURSOR_API_KEY && !process.env.CURSOR_API_KEY_FILE && !process.env.CURSOR_SERVICE_ACCOUNT_KEY) {
    log("Note: no CURSOR_* key in env; agent-sdk will try the logged-in CLI credential.");
  }

  process.on("exit", stopServes);
  process.on("SIGINT", () => {
    stopServes();
    process.exit(130);
  });

  try {
    await stepInstall();

    log("\n== Boot durable serves ==");
    startServe(paDir, PA_PORT);
    startServe(fridgeDir, FRIDGE_PORT);
    await waitForHealth(urls.pa);
    await waitForHealth(urls.fridge);
    pass("PA serve healthy", urls.pa);
    pass("Fridge serve healthy", urls.fridge);

    const pa = await stepPersonalAssistantReceives();
    await stepFridgeAppliesShare(pa.share, pa.identity);
    await stepFridgeCreatesTask(pa.identity);
    await stepPersonalAssistantIngests();
  } finally {
    stopServes();
  }

  log("\n== Summary ==");
  const passed = steps.filter((step) => step.ok).length;
  const failed = steps.filter((step) => !step.ok).length;
  log(`${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    log("\nFailures:");
    for (const item of failures) {
      log(`- ${item}`);
    }
    process.exitCode = 1;
    return;
  }
  log("All demo validations passed.");
}

main().catch((error) => {
  stopServes();
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
