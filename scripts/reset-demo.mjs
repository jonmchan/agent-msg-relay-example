#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const botPackages = ["fridge-bot", "personal-assistant-bot", "cursor-agent-template"];
const projects = [root, ...botPackages.map((name) => join(root, name))];

const removed = [];
const cleared = [];

async function removePath(path, label = path) {
  if (!existsSync(path)) {
    return;
  }
  await rm(path, { recursive: true, force: true });
  removed.push(label.startsWith(root) ? relative(label) : label);
}

function relative(path) {
  return path.startsWith(root + "/") ? path.slice(root.length + 1) : path === root ? "." : path;
}

async function stripAgentsMdRelaySection(projectDir) {
  const file = join(projectDir, "AGENTS.md");
  if (!existsSync(file)) {
    return;
  }
  const before = await readFile(file, "utf8");
  const after = before.replace(
    /<!--\s*agent-msg-relay\s*-->[\s\S]*?<!--\s*\/agent-msg-relay\s*-->\s*/g,
    "",
  );
  if (after === before) {
    // Whole file is relay-related or leftover empty — drop it for a clean demo.
    if (/agent-msg-relay|\.agent-msg/.test(before) || before.trim() === "") {
      await removePath(file);
    }
    return;
  }
  const trimmed = after.trim();
  if (trimmed === "") {
    await removePath(file);
    return;
  }
  await writeFile(file, `${trimmed}\n`);
  cleared.push(relative(file));
}

async function stripSkillsLock(projectDir) {
  const file = join(projectDir, "skills-lock.json");
  if (!existsSync(file)) {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    await removePath(file);
    return;
  }
  if (parsed?.skills?.["agent-msg-relay"] === undefined) {
    return;
  }
  delete parsed.skills["agent-msg-relay"];
  if (Object.keys(parsed.skills ?? {}).length === 0) {
    await removePath(file);
    return;
  }
  await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
  cleared.push(relative(file));
}

async function removeRelayBin(projectDir) {
  const binDir = join(projectDir, "bin");
  if (!existsSync(binDir)) {
    return;
  }
  const marker = join(binDir, "SHA256SUMS");
  const darwin = join(binDir, "aarch64-apple-darwin", "agent-msg-relay");
  const linux = join(binDir, "x86_64-unknown-linux-musl", "agent-msg-relay");
  if (existsSync(marker) || existsSync(darwin) || existsSync(linux)) {
    await removePath(binDir);
  }
}

async function removeEmptyParents(dir) {
  if (!existsSync(dir)) {
    return;
  }
  const entries = await readdir(dir);
  if (entries.length === 0) {
    await removePath(dir);
  }
}

for (const project of projects) {
  if (!existsSync(project)) {
    continue;
  }

  // Wipe all local runtime state: sessions, runner DBs, reminders, task KV.
  await removePath(join(project, ".agent-serve"));

  // agent-msg-relay skill + config
  await removePath(join(project, ".agents"));
  await removePath(join(project, "bot", "skills", "agent-msg-relay"));
  await removePath(join(project, ".agent-msg"));
  await removePath(join(project, ".claude"));
  await removeRelayBin(project);
  await stripSkillsLock(project);
  await stripAgentsMdRelaySection(project);
}

// Isolated harness cwds from bot/agent.js — prior turns seed AGENTS.md / skills here.
const cacheRoot = join(homedir(), ".cache", "agent-serve");
for (const name of botPackages) {
  await removePath(join(cacheRoot, name), `~/.cache/agent-serve/${name}`);
}

console.log("Demo reset complete.");
if (cleared.length > 0) {
  console.log("Cleared:");
  for (const path of cleared) {
    console.log(`  ${path}`);
  }
}
if (removed.length > 0) {
  console.log("Removed:");
  for (const path of removed) {
    console.log(`  ${path}`);
  }
}
if (cleared.length === 0 && removed.length === 0) {
  console.log("Nothing to clean.");
}
