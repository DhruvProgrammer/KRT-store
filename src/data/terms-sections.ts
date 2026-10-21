import type { LegalSection } from "../components/LegalPage";
import { REFUND_POLICY, UPDATE_POLICY } from "./policy";
import { LICENSE_TIERS } from "./licenses";

export const termsSections: LegalSection[] = [
  {
    title: "Acceptance",
    body: [
      "By using the KRT store you agree to these terms. If you don't agree, please don't use the store."
    ]
  },
  {
    title: "Accounts",
    body: [
      "You're responsible for keeping your sign-in link private. We sign you in with a one-time magic link sent to your email — anyone who has access to your email has access to your account."
    ]
  },
  {
    title: "Purchases and licences",
    body: [
      "Each product comes with a licence tier, chosen on the product page before you buy. The summary shown there is binding; the full licence text is delivered with the file."
    ],
    // ponytail: the terms used to define only TWO of the three tiers that were
    // actually sold, and used a third naming scheme ("developer and agency")
    // in the FAQ. Now they come from the same file as the picker.
    list: LICENSE_TIERS.map((tier) => `${tier.label} — ${tier.permits}`)
  },
  {
    title: "Refunds",
    body: [
      // ponytail: this used to say "if a product doesn't work as described
      // and we can't fix it" while the marketing promised a no-questions-asked
      // refund at the point of sale. One source of truth now.
      `${REFUND_POLICY.terms} We'll process it within 5 business days.`
    ]
  },
  {
    title: "Acceptable use",
    body: [
      "Don't resell our products as-is. Don't redistribute the source files publicly. Don't claim authorship."
    ]
  },
  {
    title: "Updates",
    body: [
      // ponytail: matches the "Lifetime updates" promise in the announcement
      // bar, the trust bar and the product page.
      UPDATE_POLICY.terms
    ]
  },
  {
    title: "Disclaimer",
    body: [
      "The store and its products are provided as-is. We make no warranty that a product will be fit for a particular purpose. We test our own work but cannot guarantee compatibility with every environment."
    ]
  },
  {
    title: "Liability",
    body: [
      "To the maximum extent allowed by law, our liability is capped at the amount you paid for the product in the last 12 months. We are not liable for indirect or consequential damages."
    ]
  },
  {
    title: "Changes",
    body: [
      "We may update these terms. Significant changes are emailed to signed-in users and the date above is updated."
    ]
  },
  {
    title: "Contact",
    body: [
      "For anything term-related, email the team."
    ]
  }
];
