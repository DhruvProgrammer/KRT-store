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
function exec(cmd, args, opts) {
  return new Promise(function (resolve, reject) {
    const child = spawn(cmd, args || [], { stdio: "pipe", shell: true, ...opts });
    let stdout = "", stderr = "";
    child.stdout.on("data", function(d) { stdout += d; });
    child.stderr.on("data", function(d) { stderr += d; });
    child.on("close", function(code) {
      if (code !== 0) reject(new Error(cmd + " " + (args || []).join(" ") + " exited " + code + ": " + (stderr || stdout)));
      else resolve(stdout.trim());
    });
  });
}

function getChangedFiles(diffStat) {
  return diffStat.split("\n").filter(function(l) {
    return l.includes("|") && !l.includes("changed");
  }).map(function(l) {
    return l.trim().split(" ")[0];
  });
}

function determineScope(files) {
  if (files.length === 0) return "";
  const dirs = files.map(function(f) { return f.split("/")[0]; }).filter(Boolean);
  const counts = {};
  for (var i = 0; i < dirs.length; i++) {
    counts[dirs[i]] = (counts[dirs[i]] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0][0];
  if (sorted[0][0] === "src" && sorted.length > 1) {
    const subDirs = files.filter(function(f) { return f.startsWith("src/"); }).map(function(f) { return f.split("/")[1]; }).filter(Boolean);
    const subCounts = {};
    for (var i = 0; i < subDirs.length; i++) {
      subCounts[subDirs[i]] = (subCounts[subDirs[i]] || 0) + 1;
    }
    const subSorted = Object.entries(subCounts).sort(function(a, b) { return b[1] - a[1]; });
    if (subSorted.length) return subSorted[0][0];
  }
  return sorted[0][0];
}

function determineType(files, diffStat) {
  const extensions = files.map(function(f) { return (f.split(".").pop() || ""); });
  const hasCss = extensions.some(function(e) { return e.match(/css|scss|less/); });
  const isStyleOnly = hasCss && extensions.every(function(e) { return e.match(/css|scss|less/); });
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
  var root = path.resolve(__dirname, "..");
  var diffStat = await exec("git", ["-C", root, "diff", "--cached", "--stat"]).catch(function() { return ""; });
  var files = getChangedFiles(diffStat);

  if (files.length === 0) return { subject: "chore: update files", body: "" };

  var scope = determineScope(files);
  var type = determineType(files, diffStat);
  var count = files.length;
  var plural = count > 1 ? "s" : "";

  var subject = "update";
  if (type === "style") subject = "style: update styling";
  else if (type === "fix") subject = "fix: resolve issue";
  else if (type === "refactor") subject = "refactor: simplify code";
  else if (type === "docs") subject = "docs: add documentation";
  else if (type === "test") subject = "test: add test coverage";
  else if (type === "feat") subject = "feat: add new feature";
  else if (type === "update") {
    if (count === 1) subject = "update " + (scope ? "(" + scope + ") " : "") + files[0];
    else subject = "update " + scope + " (" + count + " file" + plural + ")";
  }

  if (subject.length > COMMIT_MSG_MAX_LEN) {
    subject = subject.slice(0, COMMIT_MSG_MAX_LEN - 3) + "...";
  }

  var bodyLines = [];
  bodyLines.push("Changed files:");
  for (var i = 0; i < Math.min(files.length, 10); i++) {
    bodyLines.push("  - " + files[i]);
  }
  if (files.length > 10) bodyLines.push("  ... and " + (files.length - 10) + " more");
  bodyLines.push("");
  bodyLines.push("Reasoning:");
  if (type === "fix") bodyLines.push("  - Resolved a bug or error condition");
  else if (type === "refactor") bodyLines.push("  - Simplified or cleaned up existing code");
  else if (type === "style") bodyLines.push("  - Adjusted visual styling or formatting");
  else if (type === "docs") bodyLines.push("  - Updated or added documentation");
  else if (type === "test") bodyLines.push("  - Added or modified tests");
  else if (type === "feat") bodyLines.push("  - Implemented new functionality");
  else if (type === "update") bodyLines.push("  - General update to existing code");

  var body = bodyLines.filter(Boolean).join("\n");
  return { subject: subject, body: body };
}

async function pushIfChanged() {
  if (isProcessing) { queued = true; return; }
  isProcessing = true;

  try {
    var root = path.resolve(__dirname, "..");
    var status = await exec("git", ["-C", root, "status", "--short"]);
    if (!status.trim()) {
      isProcessing = false;
      if (queued) { queued = false; }
      return;
    }

    console.log("[auto-commit] Detected changes in", status.trim().split("\n").length, "files");

    await exec("git", ["-C", root, "add", "."]);

    var hasStaged = await exec("git", ["-C", root, "diff", "--cached", "--quiet"]).then(function() { return false; }).catch(function() { return true; });
    if (!hasStaged) {
      isProcessing = false;
      if (queued) { queued = false; }
      return;
    }

    var msg = await generateCommitMessage();
    await exec("git", ["-C", root, "commit", "-m", msg.subject, "-m", msg.body]);
    console.log("[auto-commit] Committed:", msg.subject);

    console.log("[auto-commit] Pushing...");
    await exec("git", ["-C", root, "push"]);
    console.log("[auto-commit] Pushed");
  } catch (err) {
    console.error("[auto-commit] Error:", err.message);
  } finally {
    isProcessing = false;
    if (queued) { queued = false; setTimeout(function() { pushIfChanged(); }, 1000); }
  }
}

/* ── Watcher ── */
function startWatch() {
  console.log("[auto-commit] Watching " + WATCH_DIR + " for changes...");

  function onChange(type, file) {
    if (file && (file.includes("node_modules") || file.includes(".git") || file.includes("dist"))) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() { pushIfChanged(); }, DEBOUNCE_MS);
  }

  fs.watch(WATCH_DIR, { recursive: true }, function(ev, filename) {
    onChange(ev, path.join(WATCH_DIR, filename));
  });
}

startWatch();
