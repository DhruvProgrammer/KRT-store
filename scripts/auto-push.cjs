#!/usr/bin/env node
/**
 * Simple auto-commit + auto-push loop.
 * Runs: git add . → git commit → git push every 10 seconds if there are changes.
 *
 * Usage: node scripts/auto-push.cjs
 */

const { spawn } = require("child_process");

const INTERVAL_MS = 10000; // 10 seconds

function run(cmd, args) {
  return new Promise(function(resolve, reject) {
    const child = spawn(cmd, args || [], { stdio: "pipe", shell: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", function(d) { stdout += d; });
    child.stderr.on("data", function(d) { stderr += d; });
    child.on("close", function(code) {
      if (code !== 0) reject(new Error("Command failed: " + cmd + " " + (args || []).join(" ")));
      else resolve(stdout.trim());
    });
  });
}

async function loop() {
  try {
    // Check if there are any changes (staged, unstaged, or untracked)
    const status = await run("git", ["-C", ".", "status", "--short"]);
    if (!status) {
      console.log("[auto-push] No changes detected.");
      return;
    }

    console.log("[auto-push] Changes detected, committing...");

    // Stage all changes
    await run("git", ["-C", ".", "add", "."]);

    // Check if there's anything staged to commit
    const hasStaged = await run("git", ["-C", ".", "diff", "--cached", "--quiet"])
      .then(function() { return false; })
      .catch(function() { return true; });

    if (!hasStaged) {
      console.log("[auto-push] Nothing staged to commit.");
      return;
    }

    // Get diff stat for a simple commit message
    const diffStat = await run("git", ["-C", ".", "diff", "--cached", "--stat"]).catch(function() { return ""; });
    const lines = diffStat.split("\n").filter(function(l) { return l.includes("|") && !l.includes("changed"); });
    
    // Build commit message
    const count = lines.length;
    let subject = "update " + count + " file" + (count > 1 ? "s" : "") + " (" + new Date().toISOString().slice(11, 19) + ")";
    
    // Commit
    await run("git", ["-C", ".", "commit", "-m", subject, "-m", "Auto-commit by auto-push.cjs"])
    console.log("[auto-push] Committed:", subject);

    // Push
    await run("git", ["-C", ".", "push"]);
    console.log("[auto-push] Pushed ✅");
  } catch (err) {
    console.error("[auto-push] Error:", err.message);
  }
}

// Start immediately, then every 10 seconds
console.log("[auto-push] Starting auto-push loop (every 10s)...");
loop();
setInterval(loop, INTERVAL_MS);
