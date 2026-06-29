#!/usr/bin/env node
/**
 * Auto-commit watcher for the KRT store.
 * Watches src/ for changes, auto-commits with a generated message, and pushes.
 *
 * Usage: node scripts/auto-commit.js
 * Requires: git, node >= 18
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/* ── Config ── */
const WATCH_DIR = path.resolve(__dirname, "..");
const DEBOUNCE_MS = 5000;          // wait 5s after last change to batch
const COMMIT_MSG_MAX_LEN = 72;     // keep first line short

let debounceTimer = null;
let isProcessing = false;
let queued = false;

/* ── Helpers ── */
function exec(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe", shell: true, ...opts });
    let stdout = "", stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`${cmd} ${args.join(" ")} exited ${code}: ${stderr || stdout}`));
      else resolve(stdout.trim());
    });
  });
}

async function gitStatus() {
  const out = await exec("git", ["-C", path.resolve(__dirname, ".."), "status", "--short"]);
  return out.trim();
}

async function generateCommitMessage() {
  const diff = await exec("git", ["-C", path.resolve(__dirname, ".."), "diff", "--cached", "--stat"]).catch(() => "");
  const lines = diff.split("\n").filter(Boolean);

  // Build a concise message from the diff stat
  const filesChanged = lines
    .filter((l) => l.includes("|") && !l.includes("changed"))
    .map((l) => l.trim().split(" ")[0]);

  const fileCount = filesChanged.length;
  if (fileCount === 0) return "autocommit: update files";

  // summarise by type
  const byType = {};
  for (const f of filesChanged) {
    const parts = f.split("/");
    const type = parts[0] || "project";
    byType[type] = (byType[type] || 0) + 1;
  }
  const summary = Object.entries(byType)
    .map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`)
    .join(", ");

  let msg = `update ${summary}`;
  if (msg.length > COMMIT_MSG_MAX_LEN) msg = msg.slice(0, COMMIT_MSG_MAX_LEN - 3) + "...";
  return msg;
}

async function pushIfChanged() {
  if (isProcessing) { queued = true; return; }
  isProcessing = true;

  try {
    const status = await gitStatus();
    if (!status) {
      isProcessing = false;
      if (queued) { queued = false; await pushIfChanged(); }
      return;
    }

    console.log("[auto-commit] Detected changes:", status.split("\n").length, "files");

    const root = path.resolve(__dirname, "..");
    await exec("git", ["-C", root, "add", "."]);

    const hasStaged = await exec("git", ["-C", root, "diff", "--cached", "--quiet"]).then(() => false).catch(() => true);
    if (!hasStaged) {
      isProcessing = false;
      if (queued) { queued = false; } // no push needed
      return;
    }

    const msg = await generateCommitMessage();
    await exec("git", ["-C", root, "commit", "-m", msg]);
    console.log("[auto-commit] Committed:", msg);

    // push
    console.log("[auto-commit] Pushing...");
    await exec("git", ["-C", root, "push"]);
    console.log("[auto-commit] Pushed ✅");
  } catch (err) {
    console.error("[auto-commit] Error:", err.message);
  } finally {
    isProcessing = false;
    if (queued) { queued = false; setTimeout(() => pushIfChanged(), 1000); }
  }
}

/* ── Watcher ── */
function startWatch() {
  console.log(`[auto-commit] Watching ${WATCH_DIR} for changes...`);

  const onChange = (type, file) => {
    if (file && (file.includes("node_modules") || file.includes(".git"))) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => pushIfChanged(), DEBOUNCE_MS);
  };

  // Use chokidar if available, else builtin fs.watch (recursive requires Node 20+ on Windows)
  let watcher;
  try {
    const chokidar = require("chokidar");
    watcher = chokidar.watch(WATCH_DIR, { ignored: /node_modules|\.git/, ignoreInitial: true });
    watcher.on("change", (p) => onChange("change", p));
    watcher.on("add", (p) => onChange("add", p));
    watcher.on("unlink", (p) => onChange("unlink", p));
  } catch {
    // fallback: watch top-level dirs individually (Windows Node < 20 doesn't support recursive)
    console.log("[auto-commit] Using fs.watch fallback (install chokidar for better perf): npm i -D chokidar");
    const dirs = fs.existsSync(WATCH_DIR) ? fs.readdirSync(WATCH_DIR).filter((d) => fs.statSync(path.join(WATCH_DIR, d)).isDirectory()) : [];
    for (const dir of dirs) {
      const target = path.join(WATCH_DIR, dir);
      fs.watch(target, { recursive: false }, (ev, filename) => onChange(ev, path.join(target, filename)));
    }
  }
}

startWatch();
