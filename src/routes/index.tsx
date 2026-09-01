import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { SheetPreview } from "@/components/SheetPreview";
import { buildPlan } from "@/lib/imposition/plan";
import { exportImposedPdf } from "@/lib/imposition/export";
import {
  PAPER_PRESETS,
  UNIT_TO_PT,
  defaultConfig,
  type ImpositionConfig,
  type Unit,
} from "@/lib/imposition/types";
import { loadPdf, type LoadedDoc } from "@/lib/pdf/thumbs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Imposer — Local PDF Book Imposition & Prepress Workstation" },
      {
        name: "description",
        content:
          "Impose PDFs into folded signatures, booklets and N-up press sheets entirely in your browser. Fold simulation, creep, crop marks and exact preview-to-export parity.",
      },
      { property: "og:title", content: "Imposer — Local PDF Imposition Workstation" },
      {
        property: "og:description",
        content:
          "Signature imposition, fold simulation and press-sheet export that runs locally — no uploads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workstation,
});

const SIG_SIZES = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 64];
const NUP = [
  { label: "2-up (1 x 2)", cols: 2, rows: 1 },
  { label: "4-up (2 x 2)", cols: 2, rows: 2 },
  { label: "8-up (4 x 2)", cols: 4, rows: 2 },
  { label: "16-up (4 x 4)", cols: 4, rows: 4 },
  { label: "3-up (3 x 1)", cols: 3, rows: 1 },
  { label: "6-up (3 x 2)", cols: 3, rows: 2 },
  { label: "9-up (3 x 3)", cols: 3, rows: 3 },
  { label: "12-up (4 x 3)", cols: 4, rows: 3 },
];

function Workstation() {
  const [cfg, setCfg] = useState<ImpositionConfig>(defaultConfig);
  const [unit, setUnit] = useState<Unit>("mm");
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [showThumbs, setShowThumbs] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [tab, setTab] = useState<"sheet" | "plan" | "fold">("sheet");
  const inputRef = useRef<HTMLInputElement>(null);


  const set = <K extends keyof ImpositionConfig>(k: K, v: ImpositionConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const pageCount = doc?.pageCount ?? 32;
  const pageSize = doc?.firstPageSize ?? { width: 419.53, height: 595.28 };

  const plan = useMemo(
    () => buildPlan(pageCount, pageSize, cfg),
    [pageCount, pageSize, cfg],
  );

  const clampedIndex = Math.max(0, Math.min(sheetIndex, plan.sheets.length - 1));
  const sheet = plan.sheets[clampedIndex]!;
  const placements = side === "front" ? sheet.front : sheet.back;


  const [busy, setBusy] = useState(false);

  const onFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setProgress("That file is not a PDF.");
      return;
    }
    setBusy(true);
    setProgress("Reading document…");
    try {
      const buf = await file.arrayBuffer();
      const loaded = await loadPdf(buf);
      setBytes(buf);
      setFileName(file.name);
      setSheetIndex(0);
      setDoc(loaded);
      setProgress(null);
    } catch {
      setProgress("Could not read that PDF — it may be encrypted or damaged.");
    } finally {
      setBusy(false);
    }
  }, []);

  const doExport = async () => {
    if (!bytes || busy) return;
    setBusy(true);
    setProgress("Imposing…");
    try {
      const out = await exportImposedPdf(bytes, plan, cfg, (d, t) =>
        setProgress(`Imposing surface ${d} / ${t}`),
      );
      const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName.replace(/\.pdf$/i, "") || "document") + "-imposed.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setProgress("Export complete.");
      setTimeout(() => setProgress(null), 2500);
    } catch (err) {
      setProgress(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };


  const toPt = (v: number) => v * UNIT_TO_PT[unit];
  const fromPt = (v: number) => +(v / UNIT_TO_PT[unit]).toFixed(2);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background/85 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold tracking-[0.2em] text-primary">
            IMPOSER
          </span>
          <h1 className="hidden text-sm text-muted-foreground sm:block">
            Local PDF book imposition &amp; prepress workstation
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="label-caps max-w-[22ch] truncate">{fileName || "no document"}</span>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-sm border border-border bg-secondary px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-secondary-foreground transition-colors hover:border-primary"
          >
            Open PDF
          </button>
          <button
            onClick={doExport}
            disabled={!bytes || busy}
            className="rounded-sm bg-primary px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Working…" : "Export imposed PDF"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </header>

      <main className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 xl:grid-cols-[300px_minmax(0,1fr)_280px] xl:overflow-hidden">
        {/* LEFT: imposition setup */}
        <section className="panel space-y-5 overflow-y-auto p-4 xl:h-full">

          <Group title="Binding">
            <Segmented
              value={cfg.mode}
              onChange={(v) => set("mode", v as ImpositionConfig["mode"])}
              options={[
                { value: "saddle", label: "Saddle" },
                { value: "perfect", label: "Perfect" },
                { value: "nup", label: "N-up" },
              ]}
            />
            {cfg.mode !== "nup" && (
              <Field label="Pages per signature">
                <select
                  className="input"
                  value={cfg.pagesPerSignature}
                  onChange={(e) => set("pagesPerSignature", +e.target.value)}
                >
                  {SIG_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} pages
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Sheet layout (N-up)">
              <select
                className="input"
                value={`${cfg.nupCols}x${cfg.nupRows}`}
                onChange={(e) => {
                  const opt = NUP.find(
                    (n) => `${n.cols}x${n.rows}` === e.target.value,
                  )!;
                  setCfg((c) => ({ ...c, nupCols: opt.cols, nupRows: opt.rows }));
                }}
              >
                {NUP.map((n) => (
                  <option key={n.label} value={`${n.cols}x${n.rows}`}>
                    {n.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duplex">
              <Segmented
                value={cfg.duplex}
                onChange={(v) => set("duplex", v as "long" | "short")}
                options={[
                  { value: "long", label: "Flip long edge" },
                  { value: "short", label: "Flip short edge" },
                ]}
              />
            </Field>
          </Group>

          <Group title="Press sheet">
            <Field label="Paper">
              <select
                className="input"
                value={
                  Object.entries(PAPER_PRESETS).find(
                    ([, [w, h]]) =>
                      Math.abs(w - cfg.sheetWidth) < 1 && Math.abs(h - cfg.sheetHeight) < 1,
                  )?.[0] ??
                  Object.entries(PAPER_PRESETS).find(
                    ([, [w, h]]) =>
                      Math.abs(h - cfg.sheetWidth) < 1 && Math.abs(w - cfg.sheetHeight) < 1,
                  )?.[0] ??
                  "custom"
                }
                onChange={(e) => {
                  const p = PAPER_PRESETS[e.target.value];
                  if (!p) return;
                  const landscape = cfg.sheetWidth >= cfg.sheetHeight;
                  setCfg((c) => ({
                    ...c,
                    sheetWidth: landscape ? p[1] : p[0],
                    sheetHeight: landscape ? p[0] : p[1],
                  }));
                }}
              >
                {Object.keys(PAPER_PRESETS).map((k) => (
                  <option key={k}>{k}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Num label={`W (${unit})`} value={fromPt(cfg.sheetWidth)} onChange={(v) => set("sheetWidth", toPt(v))} />
              <Num label={`H (${unit})`} value={fromPt(cfg.sheetHeight)} onChange={(v) => set("sheetHeight", toPt(v))} />
              <Field label="Unit">
                <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  {(["mm", "cm", "in", "pt"] as Unit[]).map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              className="w-full rounded-sm border border-border py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-foreground"
              onClick={() =>
                setCfg((c) => ({ ...c, sheetWidth: c.sheetHeight, sheetHeight: c.sheetWidth }))
              }
            >
              Rotate sheet
            </button>
          </Group>

          <Group title="Geometry">
            <div className="grid grid-cols-2 gap-2">
              <Num label={`Margin (${unit})`} value={fromPt(cfg.marginLeft)} onChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  marginLeft: toPt(v), marginRight: toPt(v), marginTop: toPt(v), marginBottom: toPt(v),
                }))} />
              <Num label={`Gutter X (${unit})`} value={fromPt(cfg.gutterX)} onChange={(v) => set("gutterX", toPt(v))} />
              <Num label={`Gutter Y (${unit})`} value={fromPt(cfg.gutterY)} onChange={(v) => set("gutterY", toPt(v))} />
              <Num label={`Binding (${unit})`} value={fromPt(cfg.bindingGutter)} onChange={(v) => set("bindingGutter", toPt(v))} />
              <Num label={`Bleed (${unit})`} value={fromPt(cfg.bleed)} onChange={(v) => set("bleed", toPt(v))} />
              <Num label={`Creep / sheet (${unit})`} value={fromPt(cfg.creep)} onChange={(v) => set("creep", toPt(v))} />
            </div>
            <Field label="Scaling">
              <Segmented
                value={cfg.scaleMode}
                onChange={(v) => set("scaleMode", v as ImpositionConfig["scaleMode"])}
                options={[
                  { value: "fit", label: "Fit" },
                  { value: "fill", label: "Fill" },
                  { value: "none", label: "100%" },
                ]}
              />
            </Field>
          </Group>

          <Group title="Marks">
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Crop marks" value={cfg.cropMarks} onChange={(v) => set("cropMarks", v)} />
              <Toggle label="Fold marks" value={cfg.foldMarks} onChange={(v) => set("foldMarks", v)} />
              <Toggle label="Page labels" value={cfg.pageLabels} onChange={(v) => set("pageLabels", v)} />
              <Toggle label="Thumbnails" value={showThumbs} onChange={setShowThumbs} />
            </div>
            <Field label="Slug line">
              <input
                className="input"
                value={cfg.slug}
                placeholder="job name / date"
                onChange={(e) => set("slug", e.target.value)}
              />
            </Field>
          </Group>
        </section>

        {/* CENTER: preview */}
        <section className="panel flex min-h-0 min-w-0 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              options={[
                { value: "sheet", label: "Press sheet" },
                { value: "plan", label: "Plan" },
                { value: "fold", label: "Fold & stack" },
              ]}
            />
            {tab === "sheet" && (
              <>
                <Segmented
                  value={side}
                  onChange={(v) => setSide(v as "front" | "back")}
                  options={[
                    { value: "front", label: "Front" },
                    { value: "back", label: "Back" },
                  ]}
                />
                <div className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <button
                    aria-label="Zoom out"
                    className="rounded-sm border border-border px-2 py-1 hover:border-primary"
                    onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  >
                    −
                  </button>
                  <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button
                    aria-label="Zoom in"
                    className="rounded-sm border border-border px-2 py-1 hover:border-primary"
                    onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  >
                    +
                  </button>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <button
                    aria-label="Previous sheet"
                    className="rounded-sm border border-border px-2 py-1 hover:border-primary disabled:opacity-40"
                    disabled={clampedIndex === 0}
                    onClick={() => setSheetIndex(Math.max(0, clampedIndex - 1))}
                  >
                    ←
                  </button>
                  <span>
                    Sheet {clampedIndex + 1} / {plan.sheets.length}
                  </span>
                  <button
                    aria-label="Next sheet"
                    className="rounded-sm border border-border px-2 py-1 hover:border-primary disabled:opacity-40"
                    disabled={clampedIndex >= plan.sheets.length - 1}
                    onClick={() =>
                      setSheetIndex(Math.min(plan.sheets.length - 1, clampedIndex + 1))
                    }
                  >
                    →
                  </button>
                </div>
              </>
            )}
          </div>

          {tab === "sheet" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void onFile(f);
              }}
              className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-background/60 transition-colors ${
                dragging ? "ring-2 ring-primary" : ""
              }`}
            >
              <SheetPreview
                plan={plan}
                cfg={cfg}
                placements={placements}
                doc={doc}
                showThumbs={showThumbs}
                zoom={zoom}
              />
              {!doc && (
                <p className="label-caps pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
                  drop a pdf here or press open pdf — demo book shown
                </p>
              )}
            </div>
          )}


          {tab === "plan" && (
            <div className="min-h-0 flex-1 overflow-auto rounded-sm bg-background/60 p-3">

              <table className="w-full border-collapse font-mono text-xs">
                <thead className="text-muted-foreground">
                  <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                    <th>Sheet</th>
                    <th>Sig</th>
                    <th>Front (cell → page)</th>
                    <th>Back (cell → page)</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.sheets.map((s) => (
                    <tr key={s.id} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 align-top">
                      <td className="text-primary">{s.id}</td>
                      <td>{s.signatureIndex + 1}</td>
                      <td>{s.front.map((p) => `r${p.cell.row}c${p.cell.col}→${p.logicalNumber}${p.rotation ? "↻" : ""}`).join("  ")}</td>
                      <td>{s.back.map((p) => `r${p.cell.row}c${p.cell.col}→${p.logicalNumber}${p.rotation ? "↻" : ""}`).join("  ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "fold" && (
            <div className="flex-1 space-y-4 overflow-auto rounded-sm bg-background/60 p-4 font-mono text-xs">
              <div>
                <div className="label-caps mb-1">Fold sequence</div>
                <div className="text-foreground">
                  {plan.foldSequence.length
                    ? plan.foldSequence.map((f) => `FOLD_${f.axis.toUpperCase()}`).join(" → ") + " → STACK"
                    : "No folds (flat N-up)"}
                </div>
              </div>
              <div>
                <div className="label-caps mb-1">Leaf order after folding (cell index, top → bottom)</div>
                <div className="text-accent">{plan.leafOrder.join(" · ") || "—"}</div>
              </div>
              <div>
                <div className="label-caps mb-2">Signature stack</div>
                <div className="space-y-1">
                  {plan.signatures.map((s) => (
                    <div
                      key={s.index}
                      className="flex items-center justify-between rounded-sm border border-border px-3 py-2"
                    >
                      <span className="text-primary">SIGNATURE {s.index + 1}</span>
                      <span>
                        pages {s.firstPage}–{s.lastPage}
                      </span>
                      <span className="text-muted-foreground">{s.sheets} sheets</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: inspector */}
        <section className="panel space-y-4 overflow-y-auto p-4 xl:h-full">
          <Group title="Document">
            <Stat k="Source pages" v={doc ? String(doc.pageCount) : "demo · 32"} />
            <Stat
              k="Trim size"
              v={`${fromPt(pageSize.width)} × ${fromPt(pageSize.height)} ${unit}`}
            />
            <Stat k="Padded blanks" v={String(plan.paddedPages)} />
            <Stat k="Logical pages" v={String(plan.totalLogicalPages)} />
          </Group>
          <Group title="Production">
            <Stat k="Signatures" v={String(plan.signatures.length)} />
            <Stat k="Sheets per sig" v={String(plan.signatures[0]?.sheets ?? 0)} />
            <Stat k="Physical sheets" v={String(plan.sheets.length)} />
            <Stat k="Printed surfaces" v={String(plan.sheets.length * 2)} />
            <Stat k="Pages per surface" v={String(plan.cols * plan.rows)} />
          </Group>
          <Group title="Validation">
            {plan.warnings.length === 0 ? (
              <p className="font-mono text-xs text-accent">All checks passed — plan is exportable.</p>
            ) : (
              plan.warnings.map((w) => (
                <p key={w} className="font-mono text-xs text-primary">
                  ! {w}
                </p>
              ))
            )}
            {!doc && (
              <p className="font-mono text-xs text-muted-foreground">
                Showing a 32-page A5 demo book. Open a PDF to impose your own — files never leave
                this browser.
              </p>
            )}
            {progress && <p className="font-mono text-xs text-primary">{progress}</p>}
          </Group>
        </section>
      </main>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h2 className="label-caps border-b border-border pb-1.5">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label-caps block truncate" title={label}>
        {label}
      </span>
      {children}
    </label>
  );
}


function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        className="input"
        type="number"
        step="0.5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between rounded-sm border px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        value
          ? "border-primary text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className={value ? "text-primary" : "text-muted-foreground"}>{value ? "on" : "off"}</span>
    </button>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-sm border border-border p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[3px] px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}
