'use strict';

// Tests for Web Bot Auth verification (web-bot-auth.js) and agent detection
// (agent-detection.js).
//
//   node services/api-gateway/agent-detection.test.cjs
//
// The RFC 9421 B.2.6 vectors and keys are the normative examples from
// RFC 9421 Appendix B.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  authorityOf,
  buildSignatureBase,
  jwkThumbprintEd25519,
  parseSignature,
  parseSignatureAgentHeader,
  parseSignatureInput,
  verifyRequestSignature
} = require('./web-bot-auth');
const { classifyVisitor, isDeclaredBot } = require('./agent-detection');

const RFC_B26_BASE = [
  '"date": Tue, 20 Apr 2021 02:07:55 GMT',
  '"@method": POST',
  '"@path": /foo',
  '"@authority": example.com',
  '"content-type": application/json',
  '"content-length": 18',
  '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"'
].join('\n');

const RFC_B26_SIGNATURE = Buffer.from(
  'wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==',
  'base64'
);

const RFC_B26_PUB = crypto.createPublicKey({
  key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAJrQLj5P/89iXES9+vFgrIy29clF9CC/oPPsw3c5D0bs=\n-----END PUBLIC KEY-----',
  format: 'pem',
  type: 'spki'
});

const RFC_B1_4_THUMBPRINT = 'LksMMTobikBtSs0Kkj2W6-3h94ssXWl8coiE1f9lQyY';

const suites = [];
function test(name, fn) { suites.push({ name, fn }); }

// ---------------------------------------------------------------------------
// RFC 9421 B.2.6 — "Signing a Request Using ed25519" (Appendix B.2.6).
// ---------------------------------------------------------------------------

test('RFC 9421 B.2.6: the RFC signature base verifies against the RFC test key', () => {
  assert.equal(crypto.verify(null, Buffer.from(RFC_B26_BASE, 'utf8'), RFC_B26_PUB, RFC_B26_SIGNATURE), true);
});

test('RFC 9421 B.2.6: a tampered signature base does not verify', () => {
  const tampered = RFC_B26_BASE.replace('"@path": /foo', '"@path": /bar');
  assert.equal(crypto.verify(null, Buffer.from(tampered, 'utf8'), RFC_B26_PUB, RFC_B26_SIGNATURE), false);
});

test('buildSignatureBase: reproduces the RFC 9421 B.2.6 signature base from its Signature-Input', () => {
  const signatureInput =
    'sig-b26=("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"';
  const req = {
    method: 'POST',
    url: '/foo',
    headers: {
      date: 'Tue, 20 Apr 2021 02:07:55 GMT',
      host: 'example.com',
      'content-type': 'application/json',
      'content-length': '18'
    }
  };
  const input = parseSignatureInput(signatureInput);
  const base = buildSignatureBase(req, input.get('sig-b26'), []);
  assert.equal(base, RFC_B26_BASE);
  assert.equal(crypto.verify(null, Buffer.from(base, 'utf8'), RFC_B26_PUB, RFC_B26_SIGNATURE), true);
});

// ---------------------------------------------------------------------------
// Parsing the Web Bot Auth profile shapes (doc: Section 5.2.5 example).
// ---------------------------------------------------------------------------

test('parseSignatureInput: parses the profile example', () => {
  const input = parseSignatureInput(
    'sig=("@authority" "signature-agent";key="sig");created=1700000000;expires=1700011111;keyid="ba3e64==";tag="web-bot-auth"'
  );
  const member = input.get('sig');
  assert.deepEqual(member.components.map((c) => c.name), ['@authority', 'signature-agent']);
  assert.equal(member.components[1].raw, '"signature-agent";key="sig"');
  assert.equal(member.params.get('created').type, 'integer');
  assert.equal(member.params.get('created').value, 1700000000);
  assert.equal(member.params.get('expires').value, 1700011111);
  assert.equal(member.params.get('keyid').value, 'ba3e64==');
  assert.equal(member.params.get('tag').value, 'web-bot-auth');
  assert.equal(
    member.rawMemberValue,
    '("@authority" "signature-agent";key="sig");created=1700000000;expires=1700011111;keyid="ba3e64==";tag="web-bot-auth"'
  );
});

test('parseSignatureAgentHeader: dictionary and legacy forms', () => {
  const entries = parseSignatureAgentHeader('sig="https://signature-agent.test";type=directory');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, 'sig');
  assert.equal(entries[0].uri, 'https://signature-agent.test');
  assert.equal(entries[0].type, 'directory');
  const legacy = parseSignatureAgentHeader('"https://signature-agent.test"');
  assert.equal(legacy[0].label, '');
  assert.equal(legacy[0].uri, 'https://signature-agent.test');
  assert.equal(legacy[0].type, undefined);
});

test('parseSignature: extracts the byte-sequence signature for the label', () => {
  const parsed = parseSignature('sig1=:aGVsbG8=:', 'sig1');
  assert.equal(parsed.value.toString('utf8'), 'hello');
});

test('authorityOf: lowercases, strips the default port, keeps other ports', () => {
  assert.equal(authorityOf({ headers: { host: 'Store.TEST' }, socket: {} }), 'store.test');
  assert.equal(authorityOf({ headers: { host: 'store.test:443' }, socket: { encrypted: true } }), 'store.test');
  assert.equal(authorityOf({ headers: { host: 'store.test:8080' }, socket: { encrypted: true } }), 'store.test:8080');
  assert.equal(authorityOf({ headers: { host: 'store.test:80' }, socket: { encrypted: false } }), 'store.test');
});

test('jwkThumbprintEd25519: RFC 9421 B.1.4 test key thumbprint', () => {
  assert.equal(
    jwkThumbprintEd25519({ crv: 'Ed25519', kty: 'OKP', x: 'JrQLj5P/89iXES9+vFgrIy29clF9CC/oPPsw3c5D0bs' }),
    RFC_B1_4_THUMBPRINT
  );
});

// ---------------------------------------------------------------------------
// Round trip through the gateway's own base-builder + crypto.
// ---------------------------------------------------------------------------

function signRoundTrip() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  const keyid = jwkThumbprintEd25519(jwk);
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 3600;
  const signatureInput =
    `sig=("@authority" "signature-agent";key="sig");created=${created};expires=${expires};keyid="${keyid}";tag="web-bot-auth"`;
  const agentHeader = 'sig="https://agent.example"';
  const req = {
    method: 'POST',
    url: '/api/orders',
    headers: { host: 'store.test', 'signature-input': signatureInput, 'signature-agent': agentHeader }
  };
  const input = parseSignatureInput(signatureInput).get('sig');
  const agentEntries = parseSignatureAgentHeader(agentHeader);
  const base = buildSignatureBase(req, input, agentEntries);
  const signature = crypto.sign(null, Buffer.from(base, 'utf8'), privateKey);
  req.headers.signature = `sig=:${signature.toString('base64')}:`;
  return { req, jwk };
}

test('Ed25519 round trip: a base built by buildSignatureBase verifies after sign', () => {
  const { req, jwk } = signRoundTrip();
  const input = parseSignatureInput(req.headers['signature-input']).get('sig');
  const base = buildSignatureBase(req, input, parseSignatureAgentHeader(req.headers['signature-agent']));
  const signature = parseSignature(req.headers.signature, 'sig');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  assert.equal(crypto.verify(null, Buffer.from(base, 'utf8'), key, signature.value), true);
});

test('stub directory round trip: verifyRequestSignature verifies a signed request', async () => {
  const { req, jwk } = signRoundTrip();
  const directory = {
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from(JSON.stringify({ keys: [jwk] }), 'utf8'));
        controller.close();
      }
    })
  };
  const result = await verifyRequestSignature(req, { directoryFetch: async () => directory });
  assert.equal(result.verified, true);
  assert.equal(result.agent, new URL('https://agent.example').href);
});

// ---------------------------------------------------------------------------
// Negative paths — profile violations never touch the network.
// ---------------------------------------------------------------------------

function profileReq(overrides) {
  const req = { method: 'GET', url: '/', headers: {} };
  for (const [name, value] of Object.entries(overrides)) req.headers[name] = value;
  return req;
}

test('verifyRequestSignature: rejects requests missing signature headers', async () => {
  const result = await verifyRequestSignature({ headers: {}, method: 'GET', url: '/' });
  assert.equal(result.verified, false);
  assert.match(result.reason, /missing/);
});

test('verifyRequestSignature: requires tag="web-bot-auth"', async () => {
  const result = await verifyRequestSignature(profileReq({
    'signature-input': 'sig=("@authority");created=1;expires=2;keyid="k";tag="nope"',
    signature: 'sig=:AAA=:',
    'signature-agent': 'sig="https://a.example"'
  }));
  assert.equal(result.verified, false);
  assert.match(result.reason, /tag must be "web-bot-auth"/);
});

test('verifyRequestSignature: requires keyid', async () => {
  const result = await verifyRequestSignature(profileReq({
    'signature-input': 'sig=("@authority");created=1;expires=2;tag="web-bot-auth"',
    signature: 'sig=:AAA=:',
    'signature-agent': 'sig="https://a.example"'
  }));
  assert.equal(result.verified, false);
  assert.match(result.reason, /keyid must be a non-empty string/);
});

test('verifyRequestSignature: rejects created after expires', async () => {
  const result = await verifyRequestSignature(profileReq({
    'signature-input': 'sig=("@authority");created=2;expires=1;keyid="k";tag="web-bot-auth"',
    signature: 'sig=:AAA=:',
    'signature-agent': 'sig="https://a.example"'
  }));
  assert.equal(result.verified, false);
  assert.match(result.reason, /created must not be after expires/);
});

test('verifyRequestSignature: requires bare @authority or bare @target-uri coverage', async () => {
  const result = await verifyRequestSignature(profileReq({
    'signature-input': 'sig=("@method");created=1;expires=2;keyid="k";tag="web-bot-auth"',
    signature: 'sig=:AAA=:',
    'signature-agent': 'sig="https://a.example"'
  }));
  assert.equal(result.verified, false);
  assert.match(result.reason, /must cover bare @authority or bare @target-uri/);
});

test('verifyRequestSignature: requires the signature to cover signature-agent;key="<label>"', async () => {
  const result = await verifyRequestSignature(profileReq({
    'signature-input':
      'sig=("@authority");created=1;expires=2;keyid="k";tag="web-bot-auth"',
    signature: 'sig=:AAA=:',
    'signature-agent': 'other="https://a.example"'
  }));
  assert.equal(result.verified, false);
  assert.match(result.reason, /Signature-Agent has no member sig/);
});

test('verifyRequestSignature: Signature-Agent must use https', async () => {
  const result = await verifyRequestSignature(profileReq({
    'signature-input':
      'sig=("@authority" "signature-agent";key="sig");created=1;expires=2;keyid="k";tag="web-bot-auth"',
    signature: 'sig=:AAA=:',
    'signature-agent': 'sig="http://a.example"'
  }));
  assert.equal(result.verified, false);
  assert.match(result.reason, /Signature-Agent must use https/);
});

// ---------------------------------------------------------------------------
// Tier 2 — declared bots — and the fallback tier.
// ---------------------------------------------------------------------------

test('isDeclaredBot: classifies declared UA tokens, not browsers', () => {
  assert.equal(isDeclaredBot({ headers: { 'user-agent': 'GPTBot/1.2' } }), true);
  assert.equal(
    isDeclaredBot({
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }),
    false
  );
});

test('classifyVisitor: unsigned requests fall back to declared/human tiers', async () => {
  assert.deepEqual(
    await classifyVisitor({ headers: { 'user-agent': 'GPTBot/1.2' }, method: 'GET', url: '/' }),
    { tier: 'declared_bot' }
  );
  assert.deepEqual(
    await classifyVisitor({ headers: { 'user-agent': 'Mozilla/5.0' }, method: 'GET', url: '/' }),
    { tier: 'human' }
  );
  assert.deepEqual(
    await classifyVisitor({ headers: {}, method: 'GET', url: '/' }),
    { tier: 'human' }
  );
});

// ---------------------------------------------------------------------------

async function run() {
  let failures = 0;
  for (const { name, fn } of suites) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failures += 1;
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }
  if (failures) {
    console.log(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log(`all ${suites.length} tests passed`);
}

run();
