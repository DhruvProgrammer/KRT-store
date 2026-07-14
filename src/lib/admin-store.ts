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

// ponytail: prototype auth — uses sessionStorage + hardcoded default password.
// Upgrade: wire to auth-service (port 3002) with bcrypt + JWT.
const AUTH_HASH = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isAuthenticated(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export async function authenticate(password: string): Promise<boolean> {
  const hash = await sha256(password);
  if (hash === AUTH_HASH) {
    try { sessionStorage.setItem(AUTH_KEY, "1"); } catch { /* ignore */ }
    return true;
  }
  return false;
}

export function logout() {
  try { sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
}
