import type { Product } from "../data/products";
import type { Category } from "../data/categories";
import type { ExtraItem } from "../data/extras";
import { products as sourceProducts } from "../data/products";
import { categories as sourceCategories } from "../data/categories";
import { extras as sourceExtras } from "../data/extras";

const EDIT_KEY = "dg-admin-edits";
const AUTH_KEY = "dg-admin-auth";

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

// ponytail: admin auth is server-side now. The client calls POST /api/auth/admin/login
// with email+password; the auth-service verifies a scrypt hash, returns a JWT
// with role=ADMIN, and writes an admin_audit_log row. SessionStorage still
// holds the token, but the token is verified server-side on every page load
// via GET /api/auth/admin/verify — there's no client-only flag to spoof.
const AUTH_KEY = "dg-admin-token";

const API_URL = import.meta.env.PUBLIC_API_URL;
if (!API_URL) {
  throw new Error("PUBLIC_API_URL is not set");
}

function readToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(AUTH_KEY);
}

function writeToken(token: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (token) sessionStorage.setItem(AUTH_KEY, token);
  else sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return readToken() !== null;
}

export async function authenticate(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (!data.accessToken) return false;
  writeToken(data.accessToken);
  return true;
}

export async function verifySession(): Promise<boolean> {
  const token = readToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/admin/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      writeToken(null);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function logout() {
  writeToken(null);
}
