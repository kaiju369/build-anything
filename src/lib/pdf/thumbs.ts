// Browser-only PDF rasterization for the preview surface.
// Source bytes are never uploaded — everything runs in the local tab.

export interface LoadedDoc {
  pageCount: number;
  firstPageSize: { width: number; height: number };
  thumb: (pageNumber: number, maxPx: number) => Promise<HTMLCanvasElement | null>;
}

export async function loadPdf(bytes: ArrayBuffer): Promise<LoadedDoc> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const first = await doc.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  const cache = new Map<number, HTMLCanvasElement>();

  return {
    pageCount: doc.numPages,
    firstPageSize: { width: vp.width, height: vp.height },
    async thumb(pageNumber, maxPx) {
      if (pageNumber < 1 || pageNumber > doc.numPages) return null;
      const cached = cache.get(pageNumber);
      if (cached) return cached;
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = maxPx / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      cache.set(pageNumber, canvas);
      return canvas;
    },
  };
}
