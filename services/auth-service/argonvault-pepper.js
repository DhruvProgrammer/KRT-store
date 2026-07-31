// ponytail: ArgonVault pepper loader. Reads a 32-byte secret from
// `brunoash alogritm/pepper.key` (gitignored). The pepper is the second
// point of failure: a DB leak alone can't verify password guesses without it.
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

module.exports = { loadPepper };
