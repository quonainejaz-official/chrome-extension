// PDF text extraction for the background service worker.
// The native Chrome PDF viewer exposes no readable DOM, so we fetch the raw
// bytes and parse them with pdf.js. MV3 service workers cannot spawn real
// Workers and the CSP forbids eval, hence `isEvalSupported: false` and the
// bundled worker asset URL below (pdf.js falls back to a main-thread worker).
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-expect-error - Vite resolves ?url to the emitted asset path.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PDF_PAGES = 80;
const MAX_PDF_CHARS = 60000;

export async function extractPdfText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF (HTTP ${res.status})`);

  const data = new Uint8Array(await res.arrayBuffer());

  const pdf = await pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  let total = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      parts.push(`[Page ${i}]\n${pageText}`);
      total += pageText.length;
    }
    if (total > MAX_PDF_CHARS) break;
  }

  return parts.join('\n\n').trim();
}
