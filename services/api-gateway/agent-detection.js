'use strict';

// Agent detection — Tier 2 (declared user-agent tokens) and the
// `X-Visitor-Type` result the gateway passes upstream.
// Tier 1 (cryptographic, Web Bot Auth) lives in web-bot-auth.js.
//
// Detection is advisory only: the site serves the same content to every
// visitor. This is policy input — rate limits, step-up auth, logging —
// never routing (no cloaking).

const { verifyRequestSignature } = require('./web-bot-auth');

// Tier 2: honest crawlers identify themselves in the User-Agent. Spoofable —
// a hint, not proof (the doc's Tier 2).
const DECLARED_BOT_PATTERNS = [
  /gptbot/i,
  /claudebot/i,
  /ccbot/i,
  /oai-searchbot/i,
  /bingbot/i,
  /google-extended/i,
  /googlebot/i,
  /duckduckgo/i
];

function isDeclaredBot(req) {
  const ua = req.headers['user-agent'];
  if (typeof ua !== 'string') return false;
  return DECLARED_BOT_PATTERNS.some((pattern) => pattern.test(ua));
}

// Returns { tier: 'verified_agent' | 'declared_bot' | 'human', id? }.
// Tier 3 (undeclared, behavioural) is the default: a request with no usable
// signal is 'human' — we do not invent a label.
async function classifyVisitor(req) {
  const verified = await verifyRequestSignature(req);
  if (verified.verified) return { tier: 'verified_agent', id: verified.agent };
  if (isDeclaredBot(req)) return { tier: 'declared_bot' };
  return { tier: 'human' };
}

module.exports = { classifyVisitor, isDeclaredBot };
