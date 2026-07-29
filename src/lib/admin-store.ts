import type { Product } from "../data/products";
import type { Category } from "../data/categories";
import type { ExtraItem } from "../data/extras";
import { products as sourceProducts } from "../data/products";
import { categories as sourceCategories } from "../data/categories";
import { extras as sourceExtras } from "../data/extras";

const EDIT_KEY = "dg-admin-edits";

function readEdits(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(EDIT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeEdits(data: Record<string, unknown>) {
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function getProducts(): Product[] {
  const edits = readEdits();
  const overrides = (edits.products as Record<string, Partial<Product>>) || {};
  const added = (edits.addedProducts as Product[]) || [];
  const merged = sourceProducts.map((p) => ({ ...p, ...overrides[p.slug] }));
  return [...merged, ...added.filter((p) => !merged.find((m) => m.slug === p.slug))];
}

export function updateProduct(slug: string, data: Partial<Product>) {
  const edits = readEdits();
  const products = (edits.products as Record<string, Partial<Product>>) || {};
  products[slug] = { ...(products[slug] || {}), ...data };
  edits.products = products;
  writeEdits(edits);
}

export function addProduct(product: Product) {
  const edits = readEdits();
  const added = (edits.addedProducts as Product[]) || [];
  if (added.find((p) => p.slug === product.slug) || sourceProducts.find((p) => p.slug === product.slug)) return;
  added.push(product);
  edits.addedProducts = added;
  writeEdits(edits);
}

export function deleteProduct(slug: string) {
  const edits = readEdits();
  const products = (edits.products as Record<string, Partial<Product>>) || {};
  delete products[slug];
  edits.products = products;
  const added = (edits.addedProducts as Product[]) || [];
  edits.addedProducts = added.filter((p) => p.slug !== slug);
  writeEdits(edits);
}

export function getCategories(): Category[] {
  const edits = readEdits();
  const overrides = (edits.categories as Record<string, Partial<Category>>) || {};
  return sourceCategories.map((c) => ({ ...c, ...overrides[c.slug] }));
}

export function updateCategory(slug: string, data: Partial<Category>) {
  const edits = readEdits();
  const cats = (edits.categories as Record<string, Partial<Category>>) || {};
  cats[slug] = { ...(cats[slug] || {}), ...data };
  edits.categories = cats;
  writeEdits(edits);
}

export function addCategory(cat: Category) {
  const edits = readEdits();
  const cats = (edits.categories as Record<string, Partial<Category>>) || {};
  cats[cat.slug] = cat;
  edits.categories = cats;
  writeEdits(edits);
}

export function deleteCategory(slug: string) {
  const edits = readEdits();
  const cats = (edits.categories as Record<string, Partial<Category>>) || {};
  delete cats[slug];
  edits.categories = cats;
  writeEdits(edits);
}

export function getExtras(): ExtraItem[] {
  return sourceExtras;
}

// ponytail: admin auth uses httpOnly cookies set by the server. There's no
// client-readable token to store. /verify is the source of truth — the
// server reads the cookie and returns the admin's id/email. sessionStorage
// only holds a non-secret "last verified" timestamp so the UI can avoid a
// pointless verify round-trip on first paint.
const AUTH_VERIFIED_AT = "dg-admin-verified-at";

const API_URL = import.meta.env.PUBLIC_API_URL;
if (!API_URL) {
  throw new Error("PUBLIC_API_URL is not set");
}

function readVerifiedAt(): number {
  if (typeof sessionStorage === "undefined") return 0;
  return Number(sessionStorage.getItem(AUTH_VERIFIED_AT) || 0);
}

function markVerified() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(AUTH_VERIFIED_AT, String(Date.now()));
}

function clearVerified() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(AUTH_VERIFIED_AT);
}

export function isAuthenticated(): boolean {
  // ponytail: the cookie is the only truth. sessionStorage here is just a
  // "we know the session was live at time T" hint — it's used to skip the
  // network verify on first paint of a session that *just* authenticated.
  // We cap the hint at 5 minutes: after that we re-verify to catch expired
  // tokens or stolen cookies that the user has since revoked.
  return Date.now() - readVerifiedAt() < 5 * 60 * 1000;
}

export async function authenticate(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include"
  });
  if (!res.ok) return false;
  await res.json();
  markVerified();
  return true;
}

export async function verifySession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/admin/verify`, {
      credentials: "include"
    });
    if (!res.ok) {
      clearVerified();
      return false;
    }
    markVerified();
    return true;
  } catch {
    return false;
  }
}

export async function logout() {
  try {
    await fetch(`${API_URL}/api/auth/admin/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch { /* network error — server-side cookie will expire on its own */ }
  clearVerified();
}
