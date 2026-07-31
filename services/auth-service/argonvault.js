// ponytail: ArgonVault — audited primitives composed per OWASP/RFC 9106.
// NOT a custom algorithm. Layers:
//   L0 canonicalize  (NFKC + trim + length cap)
//   L1 HMAC pepper    (DB breach alone can't verify guesses)
//   L2 per-user salt  (embedded in Argon2id PHC string by the argon2 lib)
//   L3 Argon2id       (memory-hard, GPU/ASIC resistant)
//   L5 versioning     (rehash on login when params drift; scrypt migration)
//
// Storage format: a PHC string from argon2, e.g.
//   "$argon2id$v=19$m=19456,t=2,p=1$<b64-salt>$<b64-hash>"
// We prefix "AV2:" to distinguish from legacy scrypt "salt:hex64" rows so the
// verifier can branch without a separate column read on the hot path.
const crypto = require('crypto');
const argon2 = require('argon2');
const { loadPepper } = require('./argonvault-pepper');

// ponytail: OWASP-baseline parameters. ~30-60ms on a modern laptop.
// Tune up to land ~200-500ms on prod hardware; the rehash hook migrates
// existing hashes automatically when you raise these.
const ARGON_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
};

const MAX_PW_BYTES = 512;
const PREFIX = 'AV2:'; // ArgonVault v2 (Argon2id). scrypt legacy = no prefix.

function canonicalize(password) {
  if (typeof password !== 'string') throw new Error('password must be string');
  const pw = password.normalize('NFKC').trim();
  if (!pw) throw new Error('empty password');
  if (Buffer.byteLength(pw, 'utf8') > MAX_PW_BYTES) {
    throw new Error(`password exceeds ${MAX_PW_BYTES} bytes`);
  }
  return pw;
}

function peppered(password) {
  const pw = canonicalize(password);
  return crypto.createHmac('sha256', loadPepper()).update(pw, 'utf8').digest();
}

async function argonvaultHash(password) {
  // argon2.hash generates its own salt, embeds params + salt in the PHC string.
  const phc = await argon2.hash(peppered(password), ARGON_PARAMS);
  return PREFIX + phc;
}

async function argonvaultVerify(password, stored) {
  if (typeof stored !== 'string') return false;
  // Legacy scrypt rows ("salt:hex64", no AV2: prefix) are handled by the
  // caller's migration path, not here. AV2: rows go through Argon2id.
  if (!stored.startsWith(PREFIX)) return false;
  const phc = stored.slice(PREFIX.length);
  try {
    return await argon2.verify(phc, peppered(password));
  } catch {
    return false;
  }
}

// ponytail: returns true if the stored hash's params are weaker than current.
// argon2 needs rehash when memoryCost/timeCost/parallelism drift — used on the
// login path to transparently upgrade aging hashes (and to migrate scrypt).
function needsRehash(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return true; // legacy scrypt
  const phc = stored.slice(PREFIX.length);
  try {
    return argon2.needsRehash(phc, ARGON_PARAMS);
  } catch {
    return true;
  }
}

module.exports = {
  argonvaultHash,
  argonvaultVerify,
  needsRehash,
  ARGON_PARAMS,
  PREFIX,
};
