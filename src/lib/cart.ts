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
const MAX_PRICE = 100000;
const MAX_QUANTITY = 99;
const MIN_QUANTITY = 1;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cart:update"));
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

  return { slug: r.slug, name: r.name, price, quantity, gradient };
}

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

function write(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    emit();
  } catch {
    /* ignore */
  }
}

export const cart = {
  getSnapshot: () => read(),
  getServerSnapshot: () => [] as CartItem[],
  subscribe: (cb: Listener) => {
    listeners.add(cb);
    const handler = () => cb();
    if (typeof window !== "undefined") window.addEventListener("cart:update", handler);
    return () => {
      listeners.delete(cb);
      if (typeof window !== "undefined") window.removeEventListener("cart:update", handler);
    };
  },
  add(item: Omit<CartItem, "quantity"> & { quantity?: number }) {
    const validated = validateItem(item);
    if (!validated) return;
    const items = read();
    const existing = items.find((i) => i.slug === validated.slug);
    const requested = Math.min(MAX_QUANTITY, validated.quantity);
    if (existing) {
      existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + requested);
    } else {
      items.push({ ...validated, quantity: requested });
    }
    write(items);
  },
  remove(slug: string) {
    if (typeof slug !== "string" || slug.length === 0) return;
    write(read().filter((i) => i.slug !== slug));
  },
  updateQuantity(slug: string, quantity: number) {
    if (typeof slug !== "string" || slug.length === 0) return;
    const clamped = sanitizeScalar(quantity, MIN_QUANTITY, MAX_QUANTITY);
    if (clamped === null) return;
    const items = read();
    const item = items.find((i) => i.slug === slug);
    if (item) {
      item.quantity = clamped;
      write(items);
    }
  },
  clear() {
    write([]);
  },
  total: () => read().reduce((s, i) => s + i.price * i.quantity, 0),
  count: () => read().reduce((s, i) => s + i.quantity, 0)
};

export function useCart() {
  const items = useSyncExternalStore(cart.subscribe, cart.getSnapshot, cart.getServerSnapshot);
  return {
    items,
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
    total: items.reduce((s, i) => s + i.price * i.quantity, 0),
    count: items.reduce((s, i) => s + i.quantity, 0)
  };
}
