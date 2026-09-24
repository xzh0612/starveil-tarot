#!/usr/bin/env node
// Runs the Python reading agent and the Vite dev server together.
//
//   npm run dev:all
//
// Vite proxies the four agent endpoints to the Python service, so the browser
// only ever talks to one origin. Either process exiting shuts the other down.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = path.join(root, "backend", ".venv", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python3";

const children = [];
let shuttingDown = false;

function run(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const prefix = `[${label}] `;
  for (const [stream, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) target.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.stderr.write(`${prefix}exited with code ${code}\n`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`Starting agent (${path.relative(root, python) || python}) and Vite…`);
run("agent", python, ["-m", "backend.app"]);
run("vite", process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js")]);
