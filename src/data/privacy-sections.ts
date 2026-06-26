import type { LegalSection } from "../components/LegalPage";

export const privacySections: LegalSection[] = [
  {
    title: "What we collect",
    body: [
      "We collect the minimum information needed to run the store: the email you sign in with, the products you buy, and basic technical data such as device type and pages viewed."
    ],
    list: [
      "Account email and display name",
      "Order history and license keys",
      "Cart contents (stored on your device for convenience)",
      "Aggregated, anonymous analytics — never tied to your identity in a saleable way"
    ]
  },
  {
    title: "What we never do",
    body: [
      "We don't sell your data, don't serve third-party advertising, and don't ask for data we don't need. If you add a real payment method in the future, that data is processed by the payment processor — never stored on our servers."
    ]
  },
  {
    title: "Cookies and local storage",
    body: [
      "Your cart and a few small UI preferences are stored on your device using browser storage. They are not transmitted to any third party."
    ],
    list: [
      "dg-cart — your cart contents, only on this device",
      "ui-prefs — small UI choices such as theme or last-viewed tab"
    ]
  },
  {
    title: "Your rights",
    body: [
      "You can request an export of your data, ask us to correct it, or ask us to delete your account and purchases at any time. We act on every request within 30 days."
    ]
  },
  {
    title: "Children",
    body: [
      "The store is not directed to children under 13 (or the age of digital consent in your jurisdiction, whichever is higher). We do not knowingly collect data from children."
    ]
  },
  {
    title: "Changes to this policy",
    body: [
      "If we make material changes, we email signed-in users and update the date at the top of this page. Continued use of the store after the change means you accept the updated policy."
    ]
  },
  {
    title: "Contact",
    body: [
      "Questions or requests? Email the team. We respond within 5 business days."
    ]
  }
];
