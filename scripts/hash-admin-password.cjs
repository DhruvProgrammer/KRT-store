#!/usr/bin/env node
// ponytail: produces the scrypt hash stored in ADMIN_PASSWORD_HASH. The
// plaintext password is read from the CLI argument or an env var, then
// discarded — only the hash is printed to stdout.
//
// Usage: node scripts/hash-admin-password.js "your password"
//        ADMIN_PASSWORD='...' node scripts/hash-admin-password.js
//
// The hash format (salt:hex64) matches what auth-service.verifyPassword()
// expects.
const crypto = require("crypto");

const password = process.argv[2] || process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("Usage: node scripts/hash-admin-password.js <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");
process.stdout.write(`${salt}:${hash}\n`);
