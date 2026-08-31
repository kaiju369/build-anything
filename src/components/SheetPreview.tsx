import { useEffect, useRef } from "react";
import type { ImpositionConfig, ImpositionPlan, Placement } from "@/lib/imposition/types";
import type { LoadedDoc } from "@/lib/pdf/thumbs";

interface Props {
  plan: ImpositionPlan;
  cfg: ImpositionConfig;
  placements: Placement[];
  doc: LoadedDoc | null;
  showThumbs: boolean;
  maxWidth?: number;
}

function css(name: string) {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function SheetPreview({ plan, cfg, placements, doc, showThumbs, maxWidth = 900 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;

    const scale = Math.min(maxWidth / plan.sheetWidth, 620 / plan.sheetHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = plan.sheetWidth * scale * dpr;
    canvas.height = plan.sheetHeight * scale * dpr;
    canvas.style.width = `${plan.sheetWidth * scale}px`;
    canvas.style.height = `${plan.sheetHeight * scale}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    const sheetColor = css("--sheet");
    const ink = css("--sheet-ink");
    const mark = css("--mark");
    const measure = css("--measure");
    const fold = css("--fold");

    const draw = async () => {
      ctx.clearRect(0, 0, plan.sheetWidth, plan.sheetHeight);
      ctx.fillStyle = sheetColor;
      ctx.fillRect(0, 0, plan.sheetWidth, plan.sheetHeight);

      // fold lines
      ctx.save();
      ctx.strokeStyle = fold;
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 0.8;
      for (let i = 1; i < plan.cols; i++) {
        const x = (plan.sheetWidth / plan.cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plan.sheetHeight);
        ctx.stroke();
      }
      for (let i = 1; i < plan.rows; i++) {
        const y = (plan.sheetHeight / plan.rows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plan.sheetWidth, y);
        ctx.stroke();
      }
      ctx.restore();

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

        // crop marks
        if (cfg.cropMarks) {
          ctx.strokeStyle = mark;
          ctx.lineWidth = 0.6;
          const len = 9;
          const off = 3;
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

        // page number badge
        const label = String(pl.logicalNumber);
        ctx.save();
        ctx.translate(pl.x + pl.width / 2, top + pl.height / 2);
        ctx.rotate((pl.rotation * Math.PI) / 180);
        ctx.font = `600 ${Math.min(48, pl.height / 4)}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = showThumbs && doc ? 0.55 : 1;
        ctx.fillStyle = ink;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [plan, cfg, placements, doc, showThumbs, maxWidth]);

  return (
    <canvas
      ref={ref}
      className="rounded-sm shadow-[var(--shadow-press)] ring-1 ring-border"
      aria-label="Press sheet preview"
    />
  );
}
