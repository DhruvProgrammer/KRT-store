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
const PAYMENT_KEY = "dg-payment-method";
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

export function paymentLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    stripe: "Stripe",
    card: "Credit / Debit card",
    razorpay: "Razorpay",
    upi: "UPI",
    bitcoin: "Bitcoin"
  };
  return labels[method] ?? method;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let cartSnapshot: CartItem[] = [];
let paymentSnapshot: PaymentMethod = "stripe";

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

function emit() {
  cartSnapshot = readKey(STORAGE_KEY);
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

function validateItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== "string" || r.slug.length === 0) return null;
  if (typeof r.name !== "string" || r.name.length === 0) return null;
  const price = Number(r.price);
  if (!Number.isFinite(price) || price < 0) return null;
  const quantity = Number(r.quantity);
  if (!Number.isFinite(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) return null;
  const gradient = typeof r.gradient === "string" ? r.gradient.trim() : "";
  if (gradient.length === 0 || gradient.length > 500) return null;
  const tag = typeof r.tag === "string" ? r.tag.trim().slice(0, 40) : undefined;
  return { slug: r.slug, name: r.name, price, quantity, gradient, tag: tag || undefined };
}

function readKey(key: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c: unknown) => validateItem(c) !== null) as CartItem[];
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

// ponytail: SSR has no localStorage, so the server always renders an empty
// cart. getServerSnapshot MUST return this stable empty array (never the
// populated client snapshot) or React throws a hydration mismatch on every
// cart/checkout page. After hydration, getSnapshot returns the real cart.
const EMPTY_CART: CartItem[] = [];
export const cart = {
  getSnapshot: () => cartSnapshot,
  getServerSnapshot: () => EMPTY_CART,
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
    writeKey(STORAGE_KEY, items);
  },
  remove(slug: string) {
    if (typeof slug !== "string" || slug.length === 0) return;
    writeKey(STORAGE_KEY, readKey(STORAGE_KEY).filter((i) => i.slug !== slug));
  },
  updateQuantity(slug: string, quantity: number) {
    if (typeof slug !== "string" || slug.length === 0) return;
    const q = Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, Math.round(quantity)));
    const items = readKey(STORAGE_KEY);
    const item = items.find((i) => i.slug === slug);
    if (item) {
      item.quantity = q;
      writeKey(STORAGE_KEY, items);
    }
  },
  clear() {
    writeKey(STORAGE_KEY, []);
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
  const paymentMethod = useSyncExternalStore<PaymentMethod>(
    cart.subscribe,
    cart.getPaymentSnapshot,
    cart.getPaymentServerSnapshot
  );
  return {
    items,
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
    setPaymentMethod: cart.setPaymentMethod,
    total: items.reduce((s, i) => s + i.price * i.quantity, 0),
    count: items.reduce((s, i) => s + i.quantity, 0)
  };
}

// Initialize cached snapshots on first client load.
if (typeof window !== "undefined") {
  // Best-effort hydration; if emit() already ran (because we are reloading
  // after a write), this just re-validates against localStorage.
  cartSnapshot = readKey(STORAGE_KEY);
  try {
    const raw = window.localStorage.getItem(PAYMENT_KEY);
    paymentSnapshot = raw && isPaymentMethod(raw) ? raw : "stripe";
  } catch {
    paymentSnapshot = "stripe";
  }
  // Cross-tab sync — when another tab updates the cart, refresh our snapshot.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === PAYMENT_KEY) {
      emit();
    }
  });
}