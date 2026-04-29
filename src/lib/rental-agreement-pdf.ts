import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import { buildStandaloneAgreementHtml } from "@/lib/rental-agreement-html";
import type { RentalAgreementSignatureV1, RentalAgreementSnapshotV1 } from "@/lib/rental-agreement-metadata";

export function buildRentalAgreementPdfBuffer(params: {
  snap: RentalAgreementSnapshotV1;
  signature: RentalAgreementSignatureV1 | null;
  title?: string;
}): Promise<Buffer> {
  const html = buildStandaloneAgreementHtml(params);
  const text = htmlToReadableText(html);
  return buildPdfBufferFromText(text);
}

function htmlToReadableText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|h1|h2|h3|ul|ol|hr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function buildPdfBufferFromText(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612; // US Letter width (pt)
  const pageHeight = 792; // US Letter height (pt)
  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const bodySize = 10.5;
  const headingSize = 12;
  const paragraphGap = 8;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginTop;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const isHeading = looksLikeHeading(paragraph);
    const size = isHeading ? headingSize : bodySize;
    const lineHeight = isHeading ? 16 : 14;
    const font = isHeading ? fontBold : fontRegular;
    const wrapped = wrapText(paragraph, pageWidth - marginX * 2, size, font);

    for (const line of wrapped) {
      if (y - lineHeight < marginBottom) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - marginTop;
      }
      page.drawText(line, {
        x: marginX,
        y,
        size,
        font,
      });
      y -= lineHeight;
    }
    y -= paragraphGap;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function looksLikeHeading(paragraph: string): boolean {
  if (/^\d+\.\s+[A-Z]/.test(paragraph)) return true;
  if (/^rental agreement\b/i.test(paragraph)) return true;
  if (/^electronic signature\b/i.test(paragraph)) return true;
  if (/^[A-Z0-9 &().,'/-]{8,80}$/.test(paragraph)) return true;
  return false;
}

function wrapText(
  input: string,
  maxWidth: number,
  size: number,
  font: PDFFont,
): string[] {
  const words = input.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}
