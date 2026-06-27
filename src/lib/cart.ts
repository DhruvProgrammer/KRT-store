import { useSyncExternalStore } from "react";

export interface CartItem {
  slug: string;
  name: string;
  price: number;
  quantity: number;
  gradient: string;
  tag?: string;
}

const STORAGE_KEY = "dg-cart";
const SAVED_KEY = "dg-saved-for-later";
const PAYMENT_KEY = "dg-payment-method";
const MAX_PRICE = 100000;
const MAX_QUANTITY = 99;
const MIN_QUANTITY = 1;

export const PAYMENT_METHODS = [
  "stripe",
  "card",
  "razorpay",
  "upi",
  "bitcoin"
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  stripe: "Stripe",
  card: "Credit / Debit card",
  razorpay: "Razorpay",
  upi: "UPI",
  bitcoin: "Bitcoin"
};

export function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_LABELS[method] ?? method;
}

type Listener = () => void;
const listeners = new Set<Listener>();

// Cached snapshots — getSnapshot must return a stable reference, otherwise
// useSyncExternalStore loops forever. We refresh these only inside `emit()`.
let cartSnapshot: CartItem[] = [];
let savedSnapshot: CartItem[] = [];
let paymentSnapshot: PaymentMethod = "stripe";

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

function emit() {
  // Refresh snapshots from localStorage so getSnapshot returns a stable
  // reference between emits.
  cartSnapshot = readKey(STORAGE_KEY);
  savedSnapshot = readKey(SAVED_KEY);
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(PAYMENT_KEY);
      paymentSnapshot = raw && isPaymentMethod(raw) ? raw : "stripe";
    } catch {
      paymentSnapshot = "stripe";
    }
  }
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cart:update"));
  }
}

function sanitizeGradient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  if (/<|>|javascript:|data:|@import|url\(|expression\(/i.test(trimmed)) return null;
  return trimmed;
}

function sanitizeScalar(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function validateItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.slug !== "string" || r.slug.length === 0 || r.slug.length > 120) return null;
  if (typeof r.name !== "string" || r.name.length === 0 || r.name.length > 200) return null;

  const price = sanitizeScalar(r.price, 0, MAX_PRICE);
  if (price === null) return null;

  const quantity = sanitizeScalar(r.quantity, MIN_QUANTITY, MAX_QUANTITY);
  if (quantity === null) return null;

  const gradient = sanitizeGradient(r.gradient);
  if (gradient === null) return null;

  // Tag is optional; when present it must be a safe short string.
  let tag: string | undefined;
  if (typeof r.tag === "string") {
    const t = r.tag.trim();
    if (t.length > 0 && t.length <= 40 && !/<|>|javascript:/i.test(t)) tag = t;
  }

  return { slug: r.slug, name: r.name, price, quantity, gradient, tag };
}

function readKey(key: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: CartItem[] = [];
    for (const candidate of parsed) {
      const valid = validateItem(candidate);
      if (valid) items.push(valid);
    }
    return items;
  } catch {
    return [];
  }
}

function writeKey(key: string, items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  emit();
}

export const cart = {
  getSnapshot: () => cartSnapshot,
  getServerSnapshot: () => cartSnapshot, // server snapshot must be stable too
  getSavedSnapshot: () => savedSnapshot,
  getSavedServerSnapshot: () => savedSnapshot,
  getPaymentSnapshot: () => paymentSnapshot,
  getPaymentServerSnapshot: () => "stripe" as PaymentMethod,
  subscribe: (cb: Listener) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  add(item: Omit<CartItem, "quantity"> & { quantity?: number }) {
    const validated = validateItem(item);
    if (!validated) return;
    const items = readKey(STORAGE_KEY);
    const existing = items.find((i) => i.slug === validated.slug);
    const requested = Math.min(MAX_QUANTITY, validated.quantity);
    if (existing) {
      existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + requested);
    } else {
      items.push({ ...validated, quantity: requested });
    }
    // If the item was previously saved, drop it from "saved for later" — it lives in the cart now.
    const saved = readKey(SAVED_KEY).filter((i) => i.slug !== validated.slug);
    if (saved.length !== readKey(SAVED_KEY).length) writeKey(SAVED_KEY, saved);
    writeKey(STORAGE_KEY, items);
  },
  remove(slug: string) {
    if (typeof slug !== "string" || slug.length === 0) return;
    writeKey(STORAGE_KEY, readKey(STORAGE_KEY).filter((i) => i.slug !== slug));
  },
  updateQuantity(slug: string, quantity: number) {
    if (typeof slug !== "string" || slug.length === 0) return;
    const clamped = sanitizeScalar(quantity, MIN_QUANTITY, MAX_QUANTITY);
    if (clamped === null) return;
    const items = readKey(STORAGE_KEY);
    const item = items.find((i) => i.slug === slug);
    if (item) {
      item.quantity = clamped;
      writeKey(STORAGE_KEY, items);
    }
  },
  clear() {
    writeKey(STORAGE_KEY, []);
  },
  saveForLater(slug: string) {
    if (typeof slug !== "string" || slug.length === 0) return;
    const items = readKey(STORAGE_KEY);
    const target = items.find((i) => i.slug === slug);
    if (!target) return;
    const remaining = items.filter((i) => i.slug !== slug);
    const saved = readKey(SAVED_KEY);
    // Don't duplicate: replace any prior saved entry for this slug.
    const deduped = saved.filter((i) => i.slug !== slug);
    deduped.push({ ...target, quantity: 1 });
    writeKey(SAVED_KEY, deduped);
    writeKey(STORAGE_KEY, remaining);
  },
  moveToCart(slug: string) {
    if (typeof slug !== "string" || slug.length === 0) return;
    const saved = readKey(SAVED_KEY);
    const target = saved.find((i) => i.slug === slug);
    if (!target) return;
    const remaining = saved.filter((i) => i.slug !== slug);
    writeKey(SAVED_KEY, remaining);
    // Re-add to cart via cart.add so quantity logic stays consistent.
    cart.add({
      slug: target.slug,
      name: target.name,
      price: target.price,
      gradient: target.gradient,
      tag: target.tag,
      quantity: target.quantity
    });
  },
  removeSaved(slug: string) {
    if (typeof slug !== "string" || slug.length === 0) return;
    writeKey(SAVED_KEY, readKey(SAVED_KEY).filter((i) => i.slug !== slug));
  },
  setPaymentMethod(method: PaymentMethod) {
    if (!isPaymentMethod(method)) return;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(PAYMENT_KEY, method);
      } catch {
        /* ignore */
      }
    }
    emit();
  },
  getPaymentMethod: (): PaymentMethod => paymentSnapshot,
  total: () => cartSnapshot.reduce((s, i) => s + i.price * i.quantity, 0),
  count: () => cartSnapshot.reduce((s, i) => s + i.quantity, 0)
};

export function useCart() {
  const items = useSyncExternalStore(cart.subscribe, cart.getSnapshot, cart.getServerSnapshot);
  const savedForLater = useSyncExternalStore(
    cart.subscribe,
    cart.getSavedSnapshot,
    cart.getSavedServerSnapshot
  );
  const paymentMethod = useSyncExternalStore<PaymentMethod>(
    cart.subscribe,
    cart.getPaymentSnapshot,
    cart.getPaymentServerSnapshot
  );
  return {
    items,
    savedForLater,
    paymentMethod,
    add: (
      product: { slug: string; name: string; price: number; gradient: string; tag?: string },
      quantity = 1
    ) =>
      cart.add({
        slug: product.slug,
        name: product.name,
        price: product.price,
        gradient: product.gradient,
        tag: product.tag,
        quantity
      }),
    remove: cart.remove,
    updateQuantity: cart.updateQuantity,
    clear: cart.clear,
    saveForLater: cart.saveForLater,
    moveToCart: cart.moveToCart,
    removeSaved: cart.removeSaved,
    setPaymentMethod: cart.setPaymentMethod,
    total: items.reduce((s, i) => s + i.price * i.quantity, 0),
    count: items.reduce((s, i) => s + i.quantity, 0),
    savedCount: savedForLater.length
  };
}

// Initialize cached snapshots on first client load.
if (typeof window !== "undefined") {
  // Best-effort hydration; if emit() already ran (because we are reloading
  // after a write), this just re-validates against localStorage.
  cartSnapshot = readKey(STORAGE_KEY);
  savedSnapshot = readKey(SAVED_KEY);
  try {
    const raw = window.localStorage.getItem(PAYMENT_KEY);
    paymentSnapshot = raw && isPaymentMethod(raw) ? raw : "stripe";
  } catch {
    paymentSnapshot = "stripe";
  }
  // Cross-tab sync — when another tab updates the cart, refresh our snapshot.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === SAVED_KEY || event.key === PAYMENT_KEY) {
      emit();
    }
  });
}