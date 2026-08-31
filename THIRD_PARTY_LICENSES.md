# Third-party licenses

Dependencies actually shipped in this application:

| Package | Purpose | License |
| --- | --- | --- |
| pdf-lib (Hopding/pdf-lib) | Vector-preserving PDF page embedding, marks drawing and export | MIT |
| pdfjs-dist (mozilla/pdf.js) | Local rasterization for the preview surface | Apache-2.0 |
| react, @tanstack/react-router, @tanstack/react-query | Application shell | MIT |
| tailwindcss | Styling | MIT |

## Conceptual references (no code copied)

imposer-rs, HornPenguin/Booklet, BookBindPager, bookletimposer, PdfBooklet,
imposition-imp, BookletKit, laydown, typst-sheetwise, cardimpose, pdfstitcher,
Stirling-PDF, qpdf and sioyek were studied for imposition math, press-sheet
modelling and viewer UX. The folding engine here is an original geometric
simulation rather than a port of any single project.
