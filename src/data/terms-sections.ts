import type { LegalSection } from "../components/LegalPage";

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
      "Each product comes with either a Regular or Extended licence. The summary on the product page is binding; the full licence text is delivered with the file."
    ],
    list: [
      "Regular — use in one project for yourself or a single client",
      "Extended — use on multiple projects, or resell as part of a larger product"
    ]
  },
  {
    title: "Refunds",
    body: [
      "If a product doesn't work as described and we can't fix it, you can request a refund within 30 days of purchase. We'll process it within 5 business days."
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
      "Your licence includes free updates within the same major version. Major upgrades are a new purchase unless otherwise stated on the product page."
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
