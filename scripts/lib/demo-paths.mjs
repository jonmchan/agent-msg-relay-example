import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const paDir = join(root, "personal-assistant-bot");
export const fridgeDir = join(root, "fridge-bot");

export function relayBinaryRel() {
  if (platform === "darwin" && arch === "arm64") {
    return join("bin", "aarch64-apple-darwin", "agent-msg-relay");
  }
  if (platform === "darwin" && arch === "x64") {
    return join("bin", "x86_64-apple-darwin", "agent-msg-relay");
  }
  if (platform === "linux" && arch === "arm64") {
    return join("bin", "aarch64-unknown-linux-musl", "agent-msg-relay");
  }
  if (platform === "linux" && arch === "x64") {
    return join("bin", "x86_64-unknown-linux-musl", "agent-msg-relay");
  }
  if (platform === "win32") {
    return join("bin", "x86_64-pc-windows-gnu", "agent-msg-relay.exe");
  }
  throw new Error(`Unsupported platform for agent-msg-relay: ${platform}/${arch}`);
}

export function relayBinary(projectDir) {
  const rel = relayBinaryRel();
  const absolute = join(projectDir, rel);
  if (!existsSync(absolute)) {
    throw new Error(`Missing ${rel} under ${projectDir}`);
  }
  return absolute;
}

export function agentMsg(projectDir, ...parts) {
  return join(projectDir, ".agent-msg", ...parts);
}

export function homeCache(...parts) {
  return join(homedir(), ".cache", "agent-serve", ...parts);
}
