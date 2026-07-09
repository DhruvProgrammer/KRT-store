import { useState, useEffect } from "react";
import Button from "../Button";
import { getProducts, updateProduct, deleteProduct, addProduct, getCategories, updateCategory, addCategory, deleteCategory, getExtras, isAuthenticated, authenticate, logout } from "../../lib/admin-store";
import type { Product } from "../../data/products";
import type { Category } from "../../data/categories";

type Tab = "dashboard" | "products" | "categories" | "extras" | "orders";

function notch(text: string) {
  return text.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Notify({ message, type, onDone }: { message: string; type?: "success" | "error"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const cls = type === "error"
    ? "border-red-500/30 bg-red-500/10 text-red-200"
    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return <p role="status" className={`rounded-2xl border px-5 py-3 text-sm font-bold ${cls}`}>{message}</p>;
}

function StarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 text-amber-400">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function LoginGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await authenticate(password);
    setLoading(false);
    if (ok) onAuth();
    else { setError(true); setPassword(""); }
  };

  return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <span aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent/5 blur-[120px]" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent-bright/5 blur-[120px]" />
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm rounded-3xl border border-line bg-surface/80 p-8 shadow-soft backdrop-blur-sm">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright font-black text-xl text-white shadow-[0_0_24px_rgba(0,162,255,0.35)]">K</span>
        <h1 className="text-center text-3xl font-black tracking-[-0.06em] text-ink">Admin sign in</h1>
        <p className="mt-2 text-center text-sm text-ink-muted">Enter the admin password to continue.</p>
        <div className="mt-6 space-y-4">
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Password" autoFocus autoComplete="off"
            className="h-12 w-full rounded-full border border-line bg-surface/60 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
          {error && <p className="text-center text-xs text-red-400">Incorrect password.</p>}
          <Button type="submit" className="w-full justify-center shadow-[0_0_22px_rgba(0,162,255,0.35)]" disabled={loading || !password}>
            {loading ? "Checking…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ProductForm({ product, onSave, onCancel }: { product: Product; onSave: (p: Product) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ ...product, features: product.features.join("\n"), compatibility: product.compatibility.join("\n") });
  const [slugEdits, setSlugEdits] = useState(false);

  const set = (field: string, value: string) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "name" && !slugEdits) next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return next;
    });
  };

  const handleSave = () => {
    onSave({
      ...form,
      features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
      compatibility: form.compatibility.split("\n").map((s) => s.trim()).filter(Boolean),
      highlights: [{ label: "Updated", value: "now" }],
      price: Number(form.price) || 0,
      rating: Number(form.rating) || 0,
      reviewCount: Number(form.reviewCount) || 0
    });
  };

  const fields = [
    { key: "name", label: "Name", cols: 2 },
    { key: "slug", label: "Slug", cols: 1 },
    { key: "category", label: "Category", cols: 1 },
    { key: "tag", label: "Tag", cols: 1 },
    { key: "price", label: "Price ($)", cols: 1 },
    { key: "version", label: "Version", cols: 1 },
    { key: "fileSize", label: "File size", cols: 1 },
    { key: "gradient", label: "Gradient", cols: 2 }
  ];

  return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/80 p-4 backdrop-blur-sm">
      <div className="mt-8 w-full max-w-2xl rounded-3xl border border-line bg-surface shadow-soft">
        <div className="rounded-t-3xl bg-gradient-to-br from-accent/15 to-accent-bright/10 px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">{product.slug ? "Edit product" : "New product"}</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">{product.slug ? product.name : "Create a new product"}</h2>
            </div>
            <button onClick={onCancel} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-ink text-ink-muted transition hover:bg-surface-bright hover:text-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className={f.cols === 2 ? "sm:col-span-2" : ""}>
                <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">{f.label}</span>
                <input value={(form as any)[f.key] ?? ""} onChange={(e) => { set(f.key, e.target.value); if (f.key === "slug") setSlugEdits(true); }}
                  className="h-11 w-full rounded-full border border-line bg-surface/60 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
              </label>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Description</span>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2}
              className="w-full rounded-2xl border border-line bg-surface/60 px-5 py-3 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Long description</span>
            <textarea value={form.longDescription} onChange={(e) => set("longDescription", e.target.value)} rows={3}
              className="w-full rounded-2xl border border-line bg-surface/60 px-5 py-3 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Features (one per line)</span>
              <textarea value={form.features} onChange={(e) => set("features", e.target.value)} rows={4}
                className="w-full rounded-2xl border border-line bg-surface/60 px-5 py-3 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Compatibility (one per line)</span>
              <textarea value={form.compatibility} onChange={(e) => set("compatibility", e.target.value)} rows={4}
                className="w-full rounded-2xl border border-line bg-surface/60 px-5 py-3 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleSave} className="shadow-[0_0_22px_rgba(0,162,255,0.35)]">{product.slug ? "Save changes" : "Create product"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [notify, setNotify] = useState<{ message: string; type?: "success" | "error" } | null>(null);

  const refresh = () => { setProducts(getProducts()); };

  useEffect(() => { refresh(); }, []);

  const handleSave = (p: Product) => {
    if (adding) {
      addProduct(p);
      setAdding(false);
    } else {
      updateProduct(p.slug, p);
      setEditProduct(null);
    }
    setNotify({ message: adding ? `"${p.name}" created.` : `"${p.name}" saved.` });
    refresh();
  };

  const handleDelete = (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    deleteProduct(p.slug);
    setNotify({ message: `"${p.name}" removed.` });
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Products</h2>
          <p className="mt-1 text-sm text-ink-muted">{products.length} products in the catalogue.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { const b = new Blob([JSON.stringify(getProducts(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "products.json"; a.click(); }}>Export</Button>
          <Button onClick={() => { setAdding(true); setEditProduct(null); }} className="shadow-[0_0_22px_rgba(0,162,255,0.35)]">+ Add product</Button>
        </div>
      </div>

      {notify && <Notify message={notify.message} type={notify.type} onDone={() => setNotify(null)} />}

      {(adding || editProduct) && (
        <ProductForm product={editProduct || { slug: "", name: "", category: "plugins", tag: "New", description: "", longDescription: "", price: 0, features: [], compatibility: [], version: "v1.0.0", fileSize: "1 MB", gradient: "linear-gradient(135deg, #8e99a8 0%, #3d4654 100%)", highlights: [], rating: 0, reviewCount: 0 }}
          onSave={handleSave} onCancel={() => { setAdding(false); setEditProduct(null); }} />
      )}

      {products.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface/40 p-12 text-center">
          <p className="text-lg font-black text-ink">No products yet.</p>
          <p className="mt-2 text-sm text-ink-muted">Add your first product to get started.</p>
          <Button onClick={() => setAdding(true)} className="mt-6">+ Add product</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.slug} className="group rounded-2xl border border-line bg-surface/70 p-4 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_0_28px_rgba(0,162,255,0.18)] sm:flex sm:items-center sm:gap-4">
              <div className="flex items-center gap-3 sm:flex-1">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl" style={{ background: p.gradient }} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-black text-ink">{p.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span className="font-mono">{p.slug}</span>
                    <span>·</span>
                    <span className="capitalize">{p.category}</span>
                    {p.rating > 0 && <><span>·</span><span className="inline-flex items-center gap-0.5"><StarIcon />{p.rating.toFixed(1)}</span></>}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 sm:mt-0 sm:justify-end">
                <span className="text-lg font-black tracking-[-0.04em] text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">${p.price}</span>
                <div className="flex gap-1">
                  <button onClick={() => { setEditProduct(p); setAdding(false); }} className="rounded-full border border-line bg-surface-ink px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-accent/40 hover:text-accent">Edit</button>
                  <button onClick={() => handleDelete(p)} className="rounded-full border border-line bg-surface-ink px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-red-500/40 hover:text-red-400">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoriesTab() {
  const [cats, setCats] = useState<Category[]>([]);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: "", name: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [notify, setNotify] = useState<{ message: string } | null>(null);

  useEffect(() => { setCats(getCategories()); }, []);
  const refresh = () => { setCats(getCategories()); };

  const startEdit = (c: Category) => { setEditSlug(c.slug); setForm({ slug: c.slug, name: c.name, description: c.description }); };
  const saveEdit = () => { if (!editSlug) return; updateCategory(editSlug, { name: form.name, description: form.description }); setEditSlug(null); setNotify({ message: "Category updated." }); refresh(); };
  const saveNew = () => { if (!form.slug || !form.name) return; addCategory({ slug: form.slug, name: form.name, tagline: "", description: form.description }); setAdding(false); setNotify({ message: "Category created." }); refresh(); };
  const handleDelete = (slug: string) => { if (!window.confirm(`Delete category "${slug}"?`)) return; deleteCategory(slug); setNotify({ message: "Category removed." }); refresh(); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Categories</h2>
          <p className="mt-1 text-sm text-ink-muted">{cats.length} categories.</p>
        </div>
        <Button onClick={() => { setAdding(true); setForm({ slug: "", name: "", description: "" }); }}>+ Add</Button>
      </div>

      {notify && <Notify message={notify.message} onDone={() => setNotify(null)} />}

      {adding && (
        <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-accent-bright/5 p-5">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-accent">New category</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {["slug", "name", "description"].map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">{field}</span>
                <input value={form[field as keyof typeof form] || ""} onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="h-10 w-full rounded-full border border-line bg-surface/60 px-4 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveNew} className="shadow-[0_0_18px_rgba(0,162,255,0.3)]">Save</Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {cats.map((c) => (
          <div key={c.slug} className="rounded-2xl border border-line bg-surface/70 px-5 py-4 shadow-soft transition duration-300 hover:border-accent/40">
            {editSlug === c.slug ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex-1"><span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 w-full rounded-full border border-line bg-surface/60 px-4 text-sm text-ink outline-none focus:border-accent" /></label>
                <label className="flex-[2]"><span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Description</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-10 w-full rounded-full border border-line bg-surface/60 px-4 text-sm text-ink outline-none focus:border-accent" /></label>
                <div className="flex gap-1 pb-1">
                  <button onClick={saveEdit} className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-accent">Save</button>
                  <button onClick={() => setEditSlug(null)} className="rounded-full border border-line px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-ink">{c.name}</p>
                  <p className="mt-0.5 text-xs text-ink-muted"><span className="font-mono">{c.slug}</span> · {c.description}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(c)} className="rounded-full border border-line bg-surface-ink px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-accent/40 hover:text-accent">Edit</button>
                  <button onClick={() => handleDelete(c.slug)} className="rounded-full border border-line bg-surface-ink px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-red-500/40 hover:text-red-400">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExtrasTab() {
  const [items, setItems] = useState(getExtras());
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Free extras</h2>
        <p className="mt-1 text-sm text-ink-muted">{items.length} free downloads.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((e) => (
          <div key={e.slug} className="rounded-2xl border border-line bg-surface/70 p-4 shadow-soft">
            <div className="h-16 w-full rounded-xl" style={{ background: e.gradient }} aria-hidden="true" />
            <p className="mt-3 text-sm font-black text-ink">{e.name}</p>
            <p className="mt-1 text-xs text-ink-muted"><span className="font-mono">{e.slug}</span> · {e.format} · {e.size}</p>
            <span className="mt-2 inline-block rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-accent">{e.category}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<{ id: string; email: string; items: number; total: number; date: string; status: string }[]>([]);
  useEffect(() => {
    try { const raw = localStorage.getItem("dg-orders"); setOrders(raw ? JSON.parse(raw) : []); } catch { setOrders([]); }
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Orders</h2>
        <p className="mt-1 text-sm text-ink-muted">{orders.length} orders.</p>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface/40 p-12 text-center">
          <p className="text-lg font-black text-ink">No orders yet.</p>
          <p className="mt-2 text-sm text-ink-muted">Orders appear here when customers complete checkout.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/70 px-5 py-4 shadow-soft">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">Order {o.id}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{o.email} · {o.date}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-right text-xs text-ink-muted">{o.items} items</span>
                <span className="text-lg font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">${o.total}</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">{o.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardTab() {
  const products = getProducts();
  const cats = getCategories();
  const extras = getExtras();
  const cartCount = (() => { try { const r = localStorage.getItem("dg-cart"); return r ? JSON.parse(r).length : 0; } catch { return 0; } })();

  const stats = [
    { label: "Products", value: String(products.length), accent: false },
    { label: "Categories", value: String(cats.length), accent: false },
    { label: "Free extras", value: String(extras.length), accent: false },
    { label: "Cart items", value: String(cartCount), accent: true }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Dashboard</h2>
        <p className="mt-1 text-sm text-ink-muted">Store overview at a glance.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl border p-5 ${s.accent ? "border-accent/30 bg-gradient-to-br from-accent/10 to-accent-bright/5" : "border-line bg-surface/60"}`}>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">{s.label}</p>
            <p className={`mt-2 text-3xl font-black tracking-[-0.05em] ${s.accent ? "text-accent drop-shadow-[0_0_10px_rgba(0,162,255,0.3)]" : "text-ink"}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/5 to-amber-400/10 p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Prototype notice</p>
        <p className="mt-2 text-sm leading-relaxed text-amber-100/80">All edits are stored in localStorage. Export products from the Products tab to persist. In production, changes would write via the catalog service (port 3003).</p>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => { if (isAuthenticated()) setAuthed(true); }, []);

  if (!authed) return <LoginGate onAuth={() => setAuthed(true)} />;

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "products", label: "Products" },
    { key: "categories", label: "Categories" },
    { key: "extras", label: "Extras" },
    { key: "orders", label: "Orders" }
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-bright font-black text-sm text-white shadow-[0_0_18px_rgba(0,162,255,0.45)]">K</span>
            <div>
              <a href="/" className="text-xs font-black uppercase tracking-[0.28em] text-accent">KRT Store</a>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink-muted">Admin panel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-full border border-line px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-accent/40 hover:text-accent">View site</a>
            <button onClick={() => { logout(); setAuthed(false); }}
              className="rounded-full border border-line px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-red-500/40 hover:text-red-400">Sign out</button>
          </div>
        </div>
        <nav className="container mx-auto flex gap-1 px-4 sm:px-6 lg:px-8" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`rounded-t-xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] transition ${
                tab === t.key ? "bg-surface text-accent shadow-[0_-2px_12px_rgba(0,162,255,0.12)]" : "text-ink-muted hover:bg-surface/30 hover:text-ink"
              }`}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "extras" && <ExtrasTab />}
        {tab === "orders" && <OrdersTab />}
      </main>
    </div>
  );
}
