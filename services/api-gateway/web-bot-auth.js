'use strict';

// Web Bot Auth verification — Tier 1: cryptographic.
//
// Mirrors the verification policy of cloudflareresearch/web-bot-auth
// (packages/web-bot-auth/src/index.ts) against RFC 9421 HTTP Message
// Signatures:
//   - signature params required: created, expires, keyid, tag
//   - tag must be "web-bot-auth"
//   - created must not be after expires
//   - signature must cover a bare @authority or bare @target-uri
//   - the signature must cover exactly one "signature-agent";key="<label>"
//   - signature-agent is https
//   - keyid must match a key the agent's directory publishes
//   - signature must not be expired, too old (maxAge 24h, clockSkew 0),
//     or created in the future
//   - a nonce, when present, is replay-rejected once
//
// Directory fetches are SSRF-guarded per the draft (6.7): HTTPS only,
// size + key-count + timeout caps, no redirects, and private, loopback and
// link-local hosts are refused. Detection is advisory only — the site
// serves the same content to every visitor; the result is policy input
// (rate limits, step-up), never routing (no cloaking).

const crypto = require('node:crypto');
const { lookup } = require('node:dns/promises');

const HTTP_MESSAGE_SIGNATURE_TAG = 'web-bot-auth';
const MAX_AGE_S = 86_400;
const CLOCK_SKEW_S = 0;
const MAX_DIRECTORY_BYTES = 64 * 1024;
const MAX_DIRECTORY_KEYS = 100;
const DIRECTORY_TIMEOUT_MS = 4000;
// ponytail: refresh granularity for the fetched directory. The draft's own
// example directory allows max-age=86400; 60s is the trust window.
const DIRECTORY_TTL_MS = 60_000;
const REPLAY_TTL_S = MAX_AGE_S;

// Ponytail: only the ranges the draft names, mapped to a CIDR set.
const PRIVATE_V4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '224.0.0.0/4',
  '240.0.0.0/4'
];
const PRIVATE_V6 = ['::/128', '::1/128', 'fc00::/7', 'fe80::/10', '2001:db8::/32'];

const directories = new Map();
const replayedNonces = new Map();

// ---------------------------------------------------------------------------
// Minimal structured-field parsers — the subset the Web Bot Auth profile
// uses: string items, tokens, integers, byte sequences and parameter lists.
// ---------------------------------------------------------------------------

function scanStringItem(s, i) {
  if (s[i] !== '"') throw new Error(`expected string item at index ${i}`);
  let out = '';
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') {
      j += 1;
      if (j >= s.length) throw new Error('unterminated string');
      out += s[j];
      j += 1;
      continue;
    }
    if (c === '"') return [out, j + 1];
    if (c === ' ' || c === '\t' || (c >= '!' && c <= '~')) {
      out += c;
      j += 1;
      continue;
    }
    throw new Error(`invalid character in string item at index ${j}`);
  }
  throw new Error('unterminated string item');
}

function scanToken(s, i) {
  const m = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+/.exec(s.slice(i));
  if (!m) throw new Error(`expected token at index ${i}`);
  return [m[0], i + m[0].length];
}

function scanParams(s, i) {
  const params = new Map();
  while (i < s.length && s[i] === ';') {
    i += 1;
    const [key, endKey] = scanToken(s, i);
    i = endKey;
    if (s[i] !== '=') throw new Error(`expected '=' after parameter ${key}`);
    i += 1;
    let value;
    if (s[i] === '"') {
      [value, i] = scanStringItem(s, i);
      params.set(key, { type: 'string', value });
      continue;
    }
    [value, i] = scanToken(s, i);
    if (/^-?\d+$/.test(value)) params.set(key, { type: 'integer', value: Number(value) });
    else if (value === '?0' || value === '?1') params.set(key, { type: 'boolean', value: value === '?1' });
    else params.set(key, { type: 'token', value });
  }
  return [params, i];
}

function scanInnerList(s, i) {
  if (s[i] !== '(') throw new Error(`expected inner list at index ${i}`);
  const items = [];
  let j = i + 1;
  for (;;) {
    while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j += 1;
    if (j >= s.length) throw new Error('unterminated inner list');
    if (s[j] === ')') {
      j += 1;
      break;
    }
    const itemStart = j;
    const [name, endOfItem] = scanStringItem(s, j);
    const [params, endOfParams] = scanParams(s, endOfItem);
    items.push({ name, params, raw: s.slice(itemStart, endOfParams) });
    j = endOfParams;
    while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j += 1;
  }
  return [items, j];
}

// Signature-Input → Map label → { components, params, rawMemberValue }
function parseSignatureInput(header) {
  const members = new Map();
  let i = 0;
  while (i < header.length) {
    while (i < header.length && /[\s,]/.test(header[i])) i += 1;
    if (i >= header.length) break;
    const labelMatch = /^[^\s=,;]+/.exec(header.slice(i));
    if (!labelMatch) throw new Error(`bad Signature-Input: expected member key at index ${i}`);
    const label = labelMatch[0];
    i += label.length;
    if (header[i] !== '=') throw new Error('bad Signature-Input: missing =');
    i += 1;
    const [items, afterList] = scanInnerList(header, i);
    const [params, afterParams] = scanParams(header, afterList);
    if (members.has(label)) throw new Error(`duplicate Signature-Input member ${label}`);
    members.set(label, { components: items, params, rawMemberValue: header.slice(i, afterParams) });
    i = afterParams;
  }
  if (members.size === 0) throw new Error('Signature-Input must carry at least one member');
  return members;
}

// Signature-Agent → [{ label, uri, type }]; legacy (bare string) yields a
// single entry with label ''.
function parseSignatureAgentHeader(header) {
  const s = header.trim();
  if (s.startsWith('"')) {
    const [uri] = scanStringItem(s, 0);
    return [{ label: '', uri, type: undefined }];
  }
  const entries = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i += 1;
    if (i >= s.length) break;
    const labelMatch = /^[^\s=,;]+/.exec(s.slice(i));
    if (!labelMatch) throw new Error('bad Signature-Agent: expected member key');
    const label = labelMatch[0];
    i += label.length;
    if (s[i] !== '=') throw new Error('bad Signature-Agent: missing =');
    i += 1;
    if (s[i] !== '"') throw new Error('bad Signature-Agent: member value must be a string');
    const [uri, endOfValue] = scanStringItem(s, i);
    const [params, afterParams] = scanParams(s, endOfValue);
    const type = params.get('type');
    entries.push({ label, uri, type: type && type.type === 'token' ? type.value : undefined });
    i = afterParams;
  }
  return entries;
}

// Signature → { value, raw } for the member with `label` (a byte sequence).
function parseSignature(header, label) {
  let i = 0;
  while (i < header.length) {
    while (i < header.length && /[\s,]/.test(header[i])) i += 1;
    if (i >= header.length) break;
    const keyMatch = /^[^\s=,;]+/.exec(header.slice(i));
    if (!keyMatch) throw new Error('bad Signature header: expected member key');
    const key = keyMatch[0];
    i += key.length;
    if (header[i] !== '=') throw new Error('bad Signature header: missing =');
    i += 1;
    if (header[i] !== ':') throw new Error('bad Signature header: expected byte sequence');
    const end = header.indexOf(':', i + 1);
    if (end === -1) throw new Error('bad Signature header: unterminated byte sequence');
    if (key === label) {
      const raw = header.slice(i + 1, end);
      if (!/^[A-Za-z0-9+/=]*$/.test(raw)) throw new Error('bad Signature: invalid base64');
      return { value: Buffer.from(raw, 'base64'), raw };
    }
    i = end + 1;
  }
  throw new Error(`bad Signature header: no member ${label}`);
}

// ---------------------------------------------------------------------------
// RFC 9421 component values.
// ---------------------------------------------------------------------------

function authorityOf(req) {
  const host = typeof req.headers.host === 'string' && req.headers.host !== ''
    ? req.headers.host
    : req.headers[':authority'];
  if (typeof host !== 'string' || host === '') throw new Error('request has no authority (Host header)');
  const authority = host.toLowerCase();
  const portMatch = /:(\d+)$/.exec(authority);
  if (portMatch) {
    const defaultPort = req.socket && req.socket.encrypted ? 443 : 80;
    if (Number(portMatch[1]) === defaultPort) return authority.slice(0, authority.length - portMatch[0].length);
  }
  return authority;
}

function componentValue(component, req, authority, agentEntries) {
  const { name, params } = component;
  switch (name) {
    case '@method':
      return typeof req.method === 'string' ? req.method : '';
    case '@authority':
      return authority;
    case '@target-uri': {
      const scheme = req.socket && req.socket.encrypted ? 'https' : 'http';
      return `${scheme}://${authority}${req.url || '/'}`;
    }
    case '@path': {
      const path = (req.url || '').split('?')[0];
      return path || '/';
    }
    case '@query': {
      const query = (req.url || '').split('?')[1];
      return query === undefined ? '' : `?${query}`;
    }
    case 'signature-agent': {
      const entry = agentEntries.find((e) => e.label === params.get('key')?.value);
      if (!entry) throw new Error(`signature-agent member ${params.get('key')?.value} is not present`);
      return entry.uri;
    }
    default: {
      const value = req.headers[name.toLowerCase()];
      if (value === undefined) throw new Error(`cannot derive component ${name}`);
      return (Array.isArray(value) ? value : [value]).join(', ');
    }
  }
}

// The signature base: `"<component>"[;params]: <value>\n` per covered
// component, then `"@signature-params": <raw Signature-Input member value>`
// as the last line (RFC 9421 §2.5).
function buildSignatureBase(req, input, agentEntries) {
  const authority = authorityOf(req);
  const lines = input.components.map((component) => {
    const value = componentValue(component, req, authority, agentEntries);
    return `${component.raw}: ${value}\n`;
  });
  lines.push(`"@signature-params": ${input.rawMemberValue}`);
  return lines.join('');
}

// ---------------------------------------------------------------------------
// SSRF guards (draft 6.7).
// ---------------------------------------------------------------------------

function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function inCidr4(ipLong, cidr) {
  const [addr, bits] = cidr.split('/');
  const mask = bits === '0' ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
  const addrLong = ipv4ToLong(addr);
  return addrLong !== null && (ipLong & mask) >>> 0 === (addrLong & mask) >>> 0;
}

function ipv6ToBigInt(ip) {
  const [head, tail] = ip.split('::');
  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array.from({ length: Math.max(missing, 0) }, () => '0'), ...tailGroups];
  if (groups.length !== 8) return null;
  let out = 0n;
  for (const group of groups) {
    const value = Number.parseInt(group, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
    out = (out << 16n) | BigInt(value);
  }
  return out;
}

function inCidr6(ip, cidr) {
  const [addr, bits] = cidr.split('/');
  const a = ipv6ToBigInt(ip);
  const b = ipv6ToBigInt(addr);
  if (a === null || b === null) return false;
  const bitsNum = Number(bits);
  const mask = bitsNum === 128 ? ~0n : ((1n << BigInt(bitsNum)) - 1n) << BigInt(128 - bitsNum);
  return (a & mask) === (b & mask);
}

function isBlockedIp(ip) {
  const v4 = ipv4ToLong(ip);
  if (v4 !== null) return PRIVATE_V4.some((c) => inCidr4(v4, c));
  const v6 = ipv6ToBigInt(ip);
  if (v6 === null) return false;
  if (PRIVATE_V6.some((c) => inCidr6(ip, c))) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  return mapped !== null && PRIVATE_V4.some((c) => inCidr4(ipv4ToLong(mapped[1]), c));
}

async function readCapped(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel();
      throw new Error('directory exceeds the size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function parseDirectory(body) {
  let jwks;
  try {
    jwks = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('directory is not valid JSON');
  }
  if (!jwks || typeof jwks !== 'object' || !Array.isArray(jwks.keys)) {
    throw new Error('directory must be a JWKS with a keys array');
  }
  if (jwks.keys.length > MAX_DIRECTORY_KEYS) throw new Error('directory exceeds the key count limit');
  return jwks;
}

// ponytail: injectable for tests — the SSRF-guarded default fetch runs in
// `defaultDirectoryFetch`; tests pass a stub that returns { status, body }.
async function defaultDirectoryFetch(directoryUrl) {
  const addresses = await lookup(directoryUrl.hostname, { all: true });
  if (addresses.length === 0) throw new Error('directory host does not resolve');
  for (const { address } of addresses) {
    if (isBlockedIp(address)) throw new Error(`directory host resolves to blocked address ${address}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECTORY_TIMEOUT_MS);
  try {
    const res = await fetch(directoryUrl.href, {
      redirect: 'manual',
      headers: { accept: 'application/http-message-signatures-directory+json' },
      signal: controller.signal
    });
    if (res.status !== 200) throw new Error(`directory fetch returned ${res.status}`);
    return { status: res.status, body: res.body };
  } finally {
    clearTimeout(timer);
  }
}

// The well-known directory URL, per the draft: the origin of the
// Signature-Agent URL + /.well-known/http-message-signatures-directory.
async function getDirectory(agentUrl, opts = {}) {
  const directoryUrl = new URL('/.well-known/http-message-signatures-directory', agentUrl.origin);
  const cached = directories.get(directoryUrl.href);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const { status, body } = await (opts.directoryFetch || defaultDirectoryFetch)(directoryUrl);
  if (status !== 200) throw new Error(`directory fetch returned ${status}`);
  const buf = await readCapped(body, MAX_DIRECTORY_BYTES);
  const jwks = parseDirectory(buf);

  const keys = new Map();
  for (const jwk of jwks.keys) {
    if (!jwk || typeof jwk !== 'object') continue;
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') continue;
    const keyid = jwkThumbprintEd25519(jwk);
    // Spec: when a JWK set is served at the well-known URI, a kid, if
    // present, MUST be the thumbprint defined by the profile — reject keys
    // that do not publish it.
    if (jwk.kid !== undefined && jwk.kid !== keyid) continue;
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
    keys.set(keyid, { key, kid: jwk.kid });
  }
  if (keys.size === 0) throw new Error('directory has no Ed25519 keys');

  directories.set(directoryUrl.href, { keys, expiresAt: Date.now() + DIRECTORY_TTL_MS });
  return keys;
}

// ---------------------------------------------------------------------------
// JWK thumbprint (RFC 8037 §A.3, same as the Cloudflare
// jsonwebkey-thumbprint package): {"crv":"Ed25519","kty":"OKP","x":"…"} →
// SHA-256 → base64url.
// ---------------------------------------------------------------------------

function b64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwkThumbprintEd25519(jwk) {
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${jwk.x}"}`;
  return b64UrlEncode(crypto.createHash('sha256').update(canonical).digest());
}

// ---------------------------------------------------------------------------
// Replay cache (draft §5.2.3; same as the TS package's validate()).
// ---------------------------------------------------------------------------

function checkNonce(nonce, expiresAtSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const seen = replayedNonces.get(nonce);
  if (seen !== undefined && seen > now) return false;
  replayedNonces.set(nonce, expiresAtSeconds);
  if (replayedNonces.size > 4096) {
    for (const [k, v] of replayedNonces) if (v <= now) replayedNonces.delete(k);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Verification entry point.
// ---------------------------------------------------------------------------

function headerValue(v) {
  return Array.isArray(v) ? v.join(', ') : v;
}

// Returns { verified: true, agent, keyid } or { verified: false, reason }.
// Never throws.
async function verifyRequestSignature(req, opts = {}) {
  try {
    const inputHeader = headerValue(req.headers['signature-input']);
    const signatureHeader = headerValue(req.headers['signature']);
    const agentHeader = headerValue(req.headers['signature-agent']);
    if (typeof inputHeader !== 'string' || typeof signatureHeader !== 'string' || typeof agentHeader !== 'string') {
      return { verified: false, reason: 'missing Signature-Input, Signature or Signature-Agent header' };
    }

    const inputs = parseSignatureInput(inputHeader);
    const labels = [...inputs.keys()];
    if (labels.length !== 1) return { verified: false, reason: 'Signature-Input must carry exactly one member' };
    const label = labels[0];
    const input = inputs.get(label);

    const agentEntries = parseSignatureAgentHeader(agentHeader);
    const agentEntry = agentEntries.find((e) => e.label === label);
    if (!agentEntry) return { verified: false, reason: `Signature-Agent has no member ${label}` };
    if (agentEntry.type !== undefined && agentEntry.type !== 'directory') {
      return { verified: false, reason: 'only the directory discovery type is supported' };
    }
    let agentUrl;
    try {
      agentUrl = new URL(agentEntry.uri);
    } catch {
      return { verified: false, reason: 'Signature-Agent value is not a valid URL' };
    }
    if (agentUrl.protocol !== 'https:') return { verified: false, reason: 'Signature-Agent must use https' };

    // --- Web Bot Auth profile (mirrors packages/web-bot-auth/src/index.ts) ---
    const params = input.params;
    const keyid = params.get('keyid');
    if (!keyid || keyid.type !== 'string' || keyid.value === '') {
      return { verified: false, reason: 'keyid must be a non-empty string' };
    }
    const tag = params.get('tag');
    if (!tag || tag.type !== 'string' || tag.value !== HTTP_MESSAGE_SIGNATURE_TAG) {
      return { verified: false, reason: `tag must be "${HTTP_MESSAGE_SIGNATURE_TAG}"` };
    }
    const created = params.get('created');
    const expires = params.get('expires');
    if (!created || !expires || created.type !== 'integer' || expires.type !== 'integer') {
      return { verified: false, reason: 'created and expires must be integers' };
    }
    if (created.value > expires.value) return { verified: false, reason: 'created must not be after expires' };
    const alg = params.get('alg');
    if (alg && alg.value !== 'ed25519') return { verified: false, reason: 'signature algorithm must be ed25519' };
    if (!input.components.some((c) => (c.name === '@authority' || c.name === '@target-uri') && c.params.size === 0)) {
      return { verified: false, reason: 'signature must cover bare @authority or bare @target-uri' };
    }
    const agentCovered = input.components.filter((c) => c.name === 'signature-agent');
    if (agentCovered.length !== 1 || agentCovered[0].params.get('key')?.value !== label) {
      return { verified: false, reason: 'signature must cover exactly one signature-agent;key="<label>"' };
    }

    const signature = parseSignature(signatureHeader, label);
    const base = buildSignatureBase(req, input, agentEntries);

    // --- key + time policy + cryptographic verification ---
    const directoryKeys = await getDirectory(agentUrl, opts);
    const candidate = directoryKeys.get(keyid.value);
    if (!candidate) return { verified: false, reason: 'keyid not found in the agent directory' };
    if (candidate.kid !== undefined && candidate.kid !== keyid.value) {
      return { verified: false, reason: 'directory key does not match keyid' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (expires.value + CLOCK_SKEW_S < now) return { verified: false, reason: 'signature has expired' };
    if (created.value > now + CLOCK_SKEW_S) return { verified: false, reason: 'signature was created in the future' };
    if (now - created.value > MAX_AGE_S + CLOCK_SKEW_S) return { verified: false, reason: 'signature is older than the maximum age' };

    if (!crypto.verify(null, Buffer.from(base, 'utf8'), candidate.key, signature.value)) {
      return { verified: false, reason: 'signature verification failed' };
    }

    const nonce = params.get('nonce');
    if (nonce && nonce.type === 'string' && !checkNonce(nonce.value, expires.value)) {
      return { verified: false, reason: 'nonce replay detected' };
    }

    return { verified: true, agent: agentUrl.href, keyid: keyid.value };
  } catch (e) {
    return { verified: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = {
  HTTP_MESSAGE_SIGNATURE_TAG,
  authorityOf,
  buildSignatureBase,
  checkNonce,
  isBlockedIp,
  jwkThumbprintEd25519,
  parseSignature,
  parseSignatureAgentHeader,
  parseSignatureInput,
  verifyRequestSignature
};
