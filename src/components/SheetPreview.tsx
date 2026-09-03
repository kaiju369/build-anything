import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ImpositionConfig, ImpositionPlan, Placement } from "@/lib/imposition/types";
import type { LoadedDoc } from "@/lib/pdf/thumbs";

interface Props {
  plan: ImpositionPlan;
  cfg: ImpositionConfig;
  placements: Placement[];
  doc: LoadedDoc | null;
  showThumbs: boolean;
  zoom?: number;
}

function css(name: string) {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function SheetPreview({ plan, cfg, placements, doc, showThumbs, zoom = 1 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 640, h: 480 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;

    const avW = Math.max(160, box.w - 24);
    const avH = Math.max(160, box.h - 24);
    const scale =
      Math.min(avW / plan.sheetWidth, avH / plan.sheetHeight) * zoom;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(plan.sheetWidth * scale * dpr);
    canvas.height = Math.round(plan.sheetHeight * scale * dpr);
    canvas.style.width = `${plan.sheetWidth * scale}px`;
    canvas.style.height = `${plan.sheetHeight * scale}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    const sheetColor = css("--sheet");
    const ink = css("--sheet-ink");
    // Mark colours come from the job's palette so the preview matches the export.
    const mark = cfg.colors.crop;
    const measure = css("--measure");
    const fold = cfg.colors.fold;

    const draw = async () => {
      ctx.clearRect(0, 0, plan.sheetWidth, plan.sheetHeight);
      ctx.fillStyle = sheetColor;
      ctx.fillRect(0, 0, plan.sheetWidth, plan.sheetHeight);

      // fold lines: midpoints between adjacent placement columns/rows
      if (cfg.foldMarks && plan.foldSequence.length > 0) {
        ctx.save();
        ctx.strokeStyle = fold;
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 0.9;
        const live = {
          x: cfg.marginLeft,
          y: cfg.marginBottom,
          w: plan.sheetWidth - cfg.marginLeft - cfg.marginRight,
          h: plan.sheetHeight - cfg.marginTop - cfg.marginBottom,
        };
        for (let i = 1; i < plan.cols; i++) {
          const x = live.x + (live.w / plan.cols) * i;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, plan.sheetHeight);
          ctx.stroke();
        }
        for (let i = 1; i < plan.rows; i++) {
          const y = live.y + (live.h / plan.rows) * i;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(plan.sheetWidth, y);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const pl of placements) {
        const top = plan.sheetHeight - pl.y - pl.height; // canvas y-down
        if (showThumbs && doc) {
          const thumb = await doc.thumb(pl.logicalNumber, 420);
          if (cancelled) return;
          if (thumb) {
            ctx.save();
            ctx.translate(pl.x + pl.width / 2, top + pl.height / 2);
            ctx.rotate((pl.rotation * Math.PI) / 180);
            ctx.drawImage(thumb, -pl.width / 2, -pl.height / 2, pl.width, pl.height);
            ctx.restore();
          }
        }
        ctx.strokeStyle = measure;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(pl.x, top, pl.width, pl.height);

        if (cfg.bleed > 0) {
          ctx.save();
          ctx.strokeStyle = measure;
          ctx.globalAlpha = 0.45;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(
            pl.x - cfg.bleed,
            top - cfg.bleed,
            pl.width + cfg.bleed * 2,
            pl.height + cfg.bleed * 2,
          );
          ctx.restore();
        }

        // crop marks
        if (cfg.cropMarks) {
          ctx.strokeStyle = mark;
          ctx.lineWidth = 0.6;
          const len = 9;
          const off = 3 + cfg.bleed;
          const xs = [pl.x, pl.x + pl.width];
          const ys = [top, top + pl.height];
          for (const x of xs)
            for (const y of ys) {
              const dx = x === pl.x ? -1 : 1;
              const dy = y === top ? -1 : 1;
              ctx.beginPath();
              ctx.moveTo(x + dx * off, y);
              ctx.lineTo(x + dx * (off + len), y);
              ctx.moveTo(x, y + dy * off);
              ctx.lineTo(x, y + dy * (off + len));
              ctx.stroke();
            }
        }

        // page number overlay
        const label = String(pl.logicalNumber);
        ctx.save();
        ctx.translate(pl.x + pl.width / 2, top + pl.height / 2);
        ctx.rotate((pl.rotation * Math.PI) / 180);
        ctx.font = `600 ${Math.min(42, pl.height / 5)}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = showThumbs && doc ? 0.4 : 0.85;
        ctx.fillStyle = ink;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }

      if (cfg.registration) {
        ctx.save();
        ctx.strokeStyle = cfg.colors.registration;
        ctx.lineWidth = 0.5;
        const r = 4.5;
        const spots: [number, number][] = [
          [plan.sheetWidth / 2, 9],
          [plan.sheetWidth / 2, plan.sheetHeight - 9],
          [9, plan.sheetHeight / 2],
          [plan.sheetWidth - 9, plan.sheetHeight / 2],
        ];
        for (const [x, y] of spots) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.moveTo(x - r - 2, y);
          ctx.lineTo(x + r + 2, y);
          ctx.moveTo(x, y - r - 2);
          ctx.lineTo(x, y + r + 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (cfg.collationMarks && sheetIndex >= 0) {
        const total = Math.max(1, plan.sheets.length);
        const barH = Math.min(18, (plan.sheetHeight - 24) / total);
        ctx.save();
        ctx.fillStyle = cfg.colors.registration;
        ctx.fillRect(
          plan.sheetWidth / 2 - 2.5,
          12 + barH * (sheetIndex % total),
          5,
          barH * 0.7,
        );
        ctx.restore();
      }

      if (cfg.slug) {
        ctx.save();
        ctx.fillStyle = cfg.colors.slug;
        ctx.globalAlpha = 0.85;
        ctx.font = `400 7px "IBM Plex Mono", monospace`;
        ctx.textBaseline = "bottom";
        ctx.fillText(cfg.slug, 6, plan.sheetHeight - 4);
        ctx.restore();
      }
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [plan, cfg, placements, doc, showThumbs, box, zoom]);

  return (
    <div
      ref={wrapRef}
      className="flex h-full w-full items-center justify-center overflow-auto p-3"
    >
      <canvas
        ref={ref}
        className="block shrink-0 rounded-sm shadow-[var(--shadow-press)] ring-1 ring-border"
        aria-label="Press sheet preview"
      />
    </div>
  );
}
