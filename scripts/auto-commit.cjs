#!/usr/bin/env node
/**
 * Auto-commit watcher for the KRT store.
 * Watches the project for changes, auto-commits with descriptive messages, and pushes.
 *
 * Usage: node scripts/auto-commit.cjs
 * Requires: git, node >= 18
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/* ── Config ── */
const WATCH_DIR = path.resolve(__dirname, "..");
const DEBOUNCE_MS = 5000;
const COMMIT_MSG_MAX_LEN = 72;

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

function getChangedFiles(diffStat) {
  const lines = diffStat.split("\n").filter((l) => l.includes("|") && !l.includes("changed"));
  return lines.map((l) => l.trim().split(" ")[0]);
}

function determineScope(files) {
  if (files.length === 0) return "";
  const dirs = files.map((f) => f.split("/")[0]).filter(Boolean);
  const counts = {};
  for (const d of dirs) counts[d] = (counts[d] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0][0];
  if (sorted[0][0] === "src" && sorted.length > 1) {
    const subDirs = files.filter((f) => f.startsWith("src/")).map((f) => f.split("/")[1]).filter(Boolean);
    const subCounts = {};
    for (const d of subDirs) subCounts[d] = (subCounts[d] || 0) + 1;
    const subSorted = Object.entries(subCounts).sort((a, b) => b[1] - a[1]);
    if (subSorted.length) return subSorted[0][0];
  }
  return sorted[0][0];
}

function determineType(files, diffStat) {
  const extensions = files.map((f) => f.split(".").pop() || "");
  const hasCss = extensions.some((e) => e.match(/css|scss|less/));
  const isStyleOnly = hasCss && extensions.every((e) => e.match(/css|scss|less/));
  if (isStyleOnly) return "style";

  const lowerDiff = diffStat.toLowerCase();
  if (lowerDiff.includes("fix") || lowerDiff.includes("bug") || lowerDiff.includes("error")) return "fix";
  if (lowerDiff.includes("refactor") || lowerDiff.includes("simplify") || lowerDiff.includes("cleanup")) return "refactor";
  if (lowerDiff.includes("test")) return "test";
  if (lowerDiff.includes("doc")) return "docs";
  if (lowerDiff.includes("remove") || lowerDiff.includes("delete") || lowerDiff.includes("kill")) return "refactor";
  if (lowerDiff.includes("add") || lowerDiff.includes("new") || lowerDiff.includes("create")) return "feat";

  return "update";
}

async function generateCommitMessage() {
  const root = path.resolve(__dirname, "..");
  const diffStat = await exec("git", ["-C", root, "diff", "--cached", "--stat"]).catch(() => "");
  const files = getChangedFiles(diffStat);

  if (files.length === 0) return { subject: "chore: update files", body: "" };

  const scope = determineScope(files);
  const type = determineType(files, diffStat);
  const count = files.length;
  const plural = count > 1 ? "s" : "";

  let subject = "update";
  if (type === "style") subject = "style: update styling";
  else if (type === "fix") subject = "fix: resolve issue";
  else if (type === "refactor") subject = "refactor: simplify code";
  else if (type === "docs") subject = "docs: add documentation";
  else if (type === "test") subject = "test: add test coverage";
  else if (type === "feat") subject = "feat: add new feature";
  else if (type === "update") {
    if (count === 1) subject = `update ${scope ? \`(${scope})\` : ""} ${files[0]}`;
    else subject = \`update ${scope} (${count} file${plural})\`;
  }

  if (subject.length > COMMIT_MSG_MAX_LEN) {
    subject = subject.slice(0, COMMIT_MSG_MAX_LEN - 3) + "...";
  }

  const bodyLines = [];
  bodyLines.push(\`Changed files:\`, ...files.slice(0, 10).map((f) => \`  - ${f}\`), files.length > 10 ? \`  ... and ${files.length - 10} more\` : "");
  bodyLines.push(``, "Reasoning:");
  if (type === "fix") bodyLines.push("  - Resolved a bug or error condition");
  else if (type === "refactor") bodyLines.push("  - Simplified or cleaned up existing code");
  else if (type === "style") bodyLines.push("  - Adjusted visual styling or formatting");
  else if (type === "docs") bodyLines.push("  - Updated or added documentation");
  else if (type === "test") bodyLines.push("  - Added or modified tests");
  else if (type === "feat") bodyLines.push("  - Implemented new functionality");
  else if (type === "update") bodyLines.push("  - General update to existing code");

  const body = bodyLines.filter(Boolean).join("\n");
  return { subject, body };
}

async function pushIfChanged() {
  if (isProcessing) { queued = true; return; }
  isProcessing = true;

  try {
    const root = path.resolve(__dirname, "..");
    const status = await exec("git", ["-C", root, "status", "--short"]);
    if (!status.trim()) {
      isProcessing = false;
      if (queued) { queued = false; }
      return;
    }

    console.log("[auto-commit] Detected changes in", status.trim().split("\n").length, "files");

    await exec("git", ["-C", root, "add", "."]);

    const hasStaged = await exec("git", ["-C", root, "diff", "--cached", "--quiet"]).then(() => false).catch(() => true);
    if (!hasStaged) {
      isProcessing = false;
      if (queued) { queued = false; }
      return;
    }

    const { subject, body } = await generateCommitMessage();
    await exec("git", ["-C", root, "commit", "-m", subject, "-m", body]);
    console.log("[auto-commit] Committed:", subject);

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
  console.log(\`[auto-commit] Watching ${WATCH_DIR} for changes...\`);

  const onChange = (type, file) => {
    if (file && (file.includes("node_modules") || file.includes(".git") || file.includes("dist"))) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => pushIfChanged(), DEBOUNCE_MS);
  };

  fs.watch(WATCH_DIR, { recursive: true }, (ev, filename) => {
    onChange(ev, path.join(WATCH_DIR, filename));
  });
}

startWatch();
