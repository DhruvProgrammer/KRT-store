#!/usr/bin/env node
// ponytail: produces the password hash stored in ADMIN_PASSWORD_HASH in .env.
// Plaintext is read from the CLI arg or ADMIN_PASSWORD env, then discarded —
// only the hash is printed to stdout.
//
// Default: ArgonVault (Argon2id + HMAC pepper from brunoash alogritm/pepper.key).
// The pepper must exist first. To mint a legacy scrypt hash (pre-pepper,
// auto-migrates on first admin login) pass --scrypt.
//
// Usage:
//   node scripts/hash-admin-password.cjs "your password"
//   node scripts/hash-admin-password.cjs "your password" --scrypt
//   ADMIN_PASSWORD='...' node scripts/hash-admin-password.cjs
const crypto = require("crypto");

const argv = process.argv.slice(2);
const useScrypt = argv.includes("--scrypt");
const password = argv.find((a) => !a.startsWith("--")) || process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("Usage: node scripts/hash-admin-password.cjs <password> [--scrypt]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

(async () => {
  if (useScrypt) {
    // ponytail: legacy format for pre-pepper setups. Auto-migrates to ArgonVault
    // on first admin login via the needsRehash() path in auth-service.
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    process.stdout.write(`${salt}:${hash}\n`);
    return;
  }
  // ponytail: ArgonVault default. Requires pepper.key in brunoash alogritm/.
  // Reads the same pepper the auth-service uses so the bootstrapped hash verifies.
  const { argonvaultHash } = require("../services/auth-service/argonvault");
  try {
    process.stdout.write((await argonvaultHash(password)) + "\n");
  } catch (e) {
    console.error("ArgonVault hash failed:", e.message);
    console.error("Generate a pepper first, or pass --scrypt for a legacy hash:");
    console.error('  node -e "require(\'fs\').writeFileSync(\'brunoash alogritm/pepper.key\', require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
})();
