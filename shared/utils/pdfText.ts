export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

export type PdfTextPage = {
  items: PdfTextItem[];
};

export type PdfTextOutput = {
  pages: PdfTextPage[];
};

export async function extractPdfText(buffer: Uint8Array): Promise<PdfTextOutput> {
  // Use the legacy build so we don't depend on a separate worker file in Node/Electron main.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js in Node disables the threaded worker but still tries to dynamically import
  // the worker module via GlobalWorkerOptions.workerSrc. To avoid filesystem-path
  // resolution surprises (and the "No GlobalWorkerOptions.workerSrc specified" error
  // when we leave it blank), pre-load the worker module and stash its
  // WorkerMessageHandler on globalThis.pdfjsWorker — pdf.js prefers that when present
  // and skips the dynamic import entirely.
  const g = globalThis as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    g.pdfjsWorker = worker;
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: buffer,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch {
    return { pages: [] };
  }

  const pages: PdfTextPage[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of text.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (typeof it.str !== 'string' || it.str.length === 0) continue;
      const x = it.transform[4] ?? 0;
      const y = it.transform[5] ?? 0;
      items.push({ str: it.str, x, y, width: it.width });
    }
    pages.push({ items });
  }
  return { pages };
}
