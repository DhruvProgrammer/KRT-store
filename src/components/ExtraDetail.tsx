import { useState } from "react";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";
import type { ExtraItem } from "../data/extras";

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

const fileTypeLabel: Record<ExtraItem["fileType"], string> = {
  pdf: "PDF",
  zip: "ZIP",
  figma: "FIGMA",
  json: "JSON",
  txt: "TXT",
  md: "MD"
};

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
}

function AccordionItem({ title, children }: AccordionItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group border-b border-line py-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left font-bold text-ink transition hover:text-accent-bright"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-base sm:text-lg">{title}</span>
        <span
          className={`ml-4 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-black text-accent transition ${
            open ? "rotate-45 bg-accent/20 shadow-[0_0_18px_rgba(0,162,255,0.4)]" : ""
          }`}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export default function ExtraDetail({ item }: { item: ExtraItem }) {
  return (
    <article>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <Reveal>
          <div className="overflow-hidden rounded-[2rem] border border-line">
            {/* SECURITY: `gradient` is static data from `src/data/extras.ts`. */}
            <div
              className="aspect-[4/3] sm:aspect-[16/10]"
              style={{ background: item.gradient }}
              role="img"
              aria-label={`${item.name} preview`}
            />
          </div>
        </Reveal>

        <div>
          <Reveal delay={0.06}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                Free download
              </span>
              <span className="rounded-full border border-white/30 bg-black/30 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                {fileTypeLabel[item.fileType]}
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
                {item.size}
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] text-ink sm:text-6xl">
              {item.name}
            </h1>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-accent">
              {item.tag}
            </p>
            <p className="mt-5 text-lg leading-8 text-ink-muted">{item.description}</p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="mt-8 rounded-2xl border border-line bg-surface/70 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">License</p>
                  <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-accent drop-shadow-[0_0_10px_rgba(0,162,255,0.3)]">
                    Free
                  </p>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                  No signup
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button
                  href={`/extras/${item.slug}.${item.fileType}`}
                  className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]"
                >
                  <DownloadIcon />
                  <span className="ml-2">Download {item.format}</span>
                </Button>
                <Button variant="secondary" href="/extras" className="w-full justify-center">
                  Browse extras
                </Button>
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <TrustMicroBar variant="full" />
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <h2 className="mb-4 text-2xl font-black tracking-[-0.06em] text-ink">About this extra</h2>
        <div className="border-t border-line">
          <AccordionItem title={`What's included`}>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>· The {item.format} file ({item.size})</li>
              <li>· Plain-language usage notes in the file itself</li>
              <li>· Free to use in personal and commercial work, no attribution required</li>
            </ul>
          </AccordionItem>
          <AccordionItem title="How to use">
            <p className="max-w-3xl text-sm text-ink-muted">
              Click the download button and the file opens directly. If your browser opens instead of saving, use
              <span className="mx-1 rounded-md border border-line bg-surface-ink px-2 py-0.5 font-mono text-xs">⌘/Ctrl+S</span>
              to save it.
            </p>
          </AccordionItem>
          <AccordionItem title="License">
            <p className="max-w-3xl text-sm text-ink-muted">
              Free to download, modify, and use in commercial projects. Do not redistribute as a paid product.
            </p>
          </AccordionItem>
        </div>
      </section>

      <section className="mt-16 rounded-3xl border border-line bg-bg-soft/50 p-8 text-center sm:p-12">
        <h2 className="mt-3 text-2xl font-black tracking-[-0.05em] text-ink sm:text-3xl">
          Want more like this?
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          We've made {Math.max(6, 12)} extras — cheatsheets, swatches, starter files. Browse them all.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/extras">Open the extras library</Button>
          <Button variant="secondary" href="/store">See paid tools</Button>
        </div>
      </section>
    </article>
  );
}
