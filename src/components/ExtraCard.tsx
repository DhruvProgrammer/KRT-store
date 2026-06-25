import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";
import type { ExtraItem } from "../data/extras";

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
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

export default function ExtraCard({ item }: { item: ExtraItem }) {
  return (
    <Reveal className="flex w-full">
      <a
        href={`/extras/${item.slug}`}
        className="group flex w-full flex-col overflow-hidden rounded-[1.25rem] border border-line bg-surface/70 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_0_28px_rgba(0,162,255,0.18)]"
      >
        <article className="flex flex-1 flex-col">
          {/* SECURITY: `gradient` is static data from `src/data/extras.ts`. */}
          <div
            className="relative h-44 shrink-0 opacity-90 transition-opacity group-hover:opacity-100"
            style={{ background: item.gradient }}
          >
            <span className="absolute right-3 top-3 rounded-full border border-white/30 bg-black/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              Free
            </span>
            <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-black/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              {fileTypeLabel[item.fileType]}
            </span>
          </div>
          <div className="flex flex-1 flex-col p-5 pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-ink-muted">{item.tag}</p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-ink transition-colors group-hover:text-accent">
              {item.name}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-7 text-ink-muted">{item.description}</p>

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span className="font-bold uppercase tracking-[0.18em]">{item.format}</span>
                <span className="font-bold">{item.size}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <TrustMicroBar variant="compact" />
                <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-accent transition group-hover:translate-x-0.5">
                  Get
                  <span>→</span>
                </span>
              </div>
            </div>
          </div>
        </article>
      </a>
    </Reveal>
  );
}
