// The three license tiers, in ONE place.
//
// ponytail: three tiers were sold on the product page but only TWO were
// defined in the Terms of Service, and a third naming scheme ("developer and
// agency licenses") appeared in the FAQ. A customer paying 4.2x for "Team"
// had no contractual definition of what they bought, and "unlimited seats"
// contradicted "25 seats" in the same component. The Terms of Service, the
// product page and the new /licensing page now all read from this file.

export type LicenseId = "regular" | "extended" | "team";

export interface LicenseTier {
  id: LicenseId;
  label: string;
  /** Human-readable seat allowance. */
  seats: number;
  /** Price multiplier applied to the product's base price. */
  multiplier: number;
  /** One line, for the picker. */
  summary: string;
  /** What this tier permits. */
  permits: string;
}

export const LICENSE_TIERS: LicenseTier[] = [
  {
    id: "regular",
    label: "Regular",
    seats: 1,
    multiplier: 1,
    summary: "Use in one project for yourself or a single client.",
    permits: "One seat. You may use the product in a single project.",
  },
  {
    id: "extended",
    label: "Extended",
    seats: 5,
    multiplier: 2.6,
    summary: "Use on multiple projects, or for an entire client studio.",
    permits: "Up to 5 seats. You may use the product across multiple projects, including for a client studio.",
  },
  {
    id: "team",
    label: "Team",
    seats: 25,
    multiplier: 4.2,
    summary: "25 seats and priority developer support for one year.",
    permits: "Up to 25 seats, plus priority developer support for the first year.",
  },
];

export function licenseTier(id: LicenseId): LicenseTier {
  return LICENSE_TIERS.find((tier) => tier.id === id) ?? LICENSE_TIERS[0];
}

/** The price of a tier for a given base price, in whole dollars. */
export function licensePrice(basePrice: number, id: LicenseId): number {
  return Math.round(basePrice * licenseTier(id).multiplier);
}
