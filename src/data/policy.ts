// The commercial policy, in ONE place.
//
// ponytail: the refund and update promises used to be written out in six
// places (the nav announcement bar, the trust micro-bar, the FAQ, the product
// page, the contact CTA and the Terms of Service) — and the marketing copy
// and the contract copy disagreed. A customer who bought a working template
// was promised "a full, no-questions-asked refund" at the point of sale and
// refused under the terms ("only if the product doesn't work and we can't fix
// it"). The same thing happened with updates: "lifetime updates" in the
// marketing, "within the same major version" in the contract.
//
// One source of truth, imported by every surface that mentions it.

export const REFUND_POLICY = {
  /** Days after purchase during which a refund can be requested. */
  windowDays: 30,
  /** One-line version, for the announcement bar and the trust micro-bar. */
  short: "30-day refund",
  /** Full sentence, for the FAQ and the product page. */
  sentence:
    "Not happy with a purchase? Email us within 30 days of purchase for a full, no-questions-asked refund.",
  /** The contractual version, for the Terms of Service. */
  terms:
    "If you are not happy with a purchase, you can request a full refund within 30 days of the purchase date, with no justification required.",
} as const;

export const UPDATE_POLICY = {
  // ponytail: the short label was "Lifetime updates" / "Free updates for
  // life", which contradicted the contract ("updates within the same major
  // version; a new major version is a separate purchase"). The label now
  // matches what the terms actually promise.
  /** One-line version. */
  short: "Free updates",
  /** Full sentence, for the FAQ and the product page. */
  sentence:
    "Every purchase includes free updates to the version you bought, for as long as we maintain that product.",
  /** The contractual version, for the Terms of Service. */
  terms:
    "Updates that ship within the same major version of a product are free for every customer, for as long as we maintain that product. A new major version is a separate purchase.",
} as const;

export const SUPPORT_POLICY = {
  hours: "Monday to Friday, business hours",
  response: "We reply to every support email within 48 hours.",
} as const;
