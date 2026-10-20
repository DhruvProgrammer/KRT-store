// ponytail: the pepper is the second point of failure: a DB leak alone
// can't verify password guesses without it.
//
// The pepper MUST be present. In production a missing pepper used to fail
// silently in two ways: every registration threw (a 500), and every AV2
// password check returned false (a 401 that looked like a wrong password) —
// and the timing-equalisation hash could not be built, so account existence
// leaked through response time. The service now refuses to start instead.
//
// Ceiling: single-process, single-host. Upgrade path: move the pepper to a
// KMS/HSM (AWS Secrets Manager, GCP Secret Manager, Vault) and read via API
// at startup; the rest of ArgonVault doesn't care where the bytes come from.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PEPPER_PATH =
  process.env.ARGONVAULT_PEPPER_PATH ||
  path.resolve(__dirname, '..', '..', 'brunoash alogritm', 'pepper.key');

let pepper = null;

function loadPepper() {
  if (pepper) return pepper;
  if (!fs.existsSync(PEPPER_PATH)) {
    // ponytail: dev fallback. A random per-process pepper means hashes don't
    // survive a restart — fine for `npm run dev`, fatal in production. We fail
    // loud in prod and warn in dev so the failure mode is never silent.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`ArgonVault pepper missing at ${PEPPER_PATH}. Generate one: ` +
        `node -e "require('fs').writeFileSync('${PEPPER_PATH.replace(/\\/g,'/')}', require('crypto').randomBytes(32).toString('hex'))"`);
    }
    console.warn(`[ArgonVault] ⚠ no pepper at ${PEPPER_PATH}; using random ephemeral pepper (dev only)`);
    return (pepper = crypto.randomBytes(32));
  }
  const hex = fs.readFileSync(PEPPER_PATH, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`ArgonVault pepper must be 64 hex chars (32 bytes). Got ${hex.length} chars.`);
  }
  return (pepper = Buffer.from(hex, 'hex'));
}

// ponytail: fail the boot if the pepper is unusable in production. The
// service is useless without it, and a half-working auth service (register
// 500s, logins 401, timing oracle open) is worse than one that refuses to
// start.
function assertPepperAvailable() {
  try {
    loadPepper();
    return true;
  } catch (err) {
    console.error(`[auth] FATAL: ${err.message}`);
    if (process.env.NODE_ENV === 'production') process.exit(1);
    return false;
  }
}

module.exports = { loadPepper, assertPepperAvailable };
