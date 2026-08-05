import path from "node:path";

import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";

/** Exact template pixel size — do not resize the canvas. */
export const FLYER_WIDTH = 723;
export const FLYER_HEIGHT = 1024;

/**
 * Layout for public/flyer/flyer.png
 * Photo fills the center circle; name sits under the ring;
 * QR covers the existing QR slot; play link targets the pause button.
 */
const LAYOUT = {
  photoCenterX: 361,
  photoCenterY: 405,
  photoDiameter: 310,
  nameY: 600,
  nameFontSize: 26,
  qrLeft: 515,
  qrTop: 800,
  qrSize: 105,
  playCenterX: 310,
  playCenterY: 645,
  playRadius: 30,
} as const;

const TEMPLATE_PATH = path.join(process.cwd(), "public/flyer/flyer.png");

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function loadDoctorPhoto(imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return null;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function buildCircularPhoto(photoBuffer: Buffer, diameter: number) {
  const mask = Buffer.from(
    `<svg width="${diameter}" height="${diameter}">
      <circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="white"/>
    </svg>`,
  );

  return sharp(photoBuffer)
    .rotate()
    .resize(diameter, diameter, { fit: "cover", position: "centre" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function buildNameOverlay(doctorName: string) {
  const safeName = escapeXml(doctorName.trim() || "Doctor");
  const svg = `
    <svg width="${FLYER_WIDTH}" height="${FLYER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${LAYOUT.photoCenterX}"
        y="${LAYOUT.nameY}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${LAYOUT.nameFontSize}"
        font-weight="700"
        fill="#2d2d2d"
      >${safeName}</text>
    </svg>`;

  return Buffer.from(svg);
}

async function buildQrOverlay(spotifyUrl: string) {
  return QRCode.toBuffer(spotifyUrl, {
    type: "png",
    width: LAYOUT.qrSize,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#5B2C8A",
      light: "#FFFFFF",
    },
  });
}

/** Composite doctor photo, name, and Spotify QR onto the flyer template (exact size). */
export async function renderDoctorFlyerImage(input: {
  doctorName: string;
  spotifyUrl: string;
  doctorImageUrl?: string | null;
}) {
  const template = sharp(TEMPLATE_PATH).ensureAlpha();
  const composites: sharp.OverlayOptions[] = [];

  const photoBuffer = await loadDoctorPhoto(input.doctorImageUrl);
  if (photoBuffer) {
    const circularPhoto = await buildCircularPhoto(
      photoBuffer,
      LAYOUT.photoDiameter,
    );
    composites.push({
      input: circularPhoto,
      left: LAYOUT.photoCenterX - Math.round(LAYOUT.photoDiameter / 2),
      top: LAYOUT.photoCenterY - Math.round(LAYOUT.photoDiameter / 2),
    });
  }

  composites.push({ input: buildNameOverlay(input.doctorName), left: 0, top: 0 });

  const qrOverlay = await buildQrOverlay(input.spotifyUrl);
  composites.push({
    input: qrOverlay,
    left: LAYOUT.qrLeft,
    top: LAYOUT.qrTop,
  });

  return template.composite(composites).png().toBuffer();
}

/**
 * Build a same-size PDF of the flyer with a clickable play-button link
 * that opens the Spotify URL.
 */
export async function renderDoctorFlyerPdf(input: {
  doctorName: string;
  spotifyUrl: string;
  doctorImageUrl?: string | null;
}) {
  const pngBuffer = await renderDoctorFlyerImage(input);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([FLYER_WIDTH, FLYER_HEIGHT]);
  const embedded = await pdfDoc.embedPng(pngBuffer);

  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: FLYER_WIDTH,
    height: FLYER_HEIGHT,
  });

  // PDF coordinates: origin bottom-left
  const linkSize = LAYOUT.playRadius * 2;
  const linkX = LAYOUT.playCenterX - LAYOUT.playRadius;
  const linkY = FLYER_HEIGHT - (LAYOUT.playCenterY + LAYOUT.playRadius);

  const linkAnnot = pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: pdfDoc.context.obj([
      PDFNumber.of(linkX),
      PDFNumber.of(linkY),
      PDFNumber.of(linkX + linkSize),
      PDFNumber.of(linkY + linkSize),
    ]),
    Border: pdfDoc.context.obj([
      PDFNumber.of(0),
      PDFNumber.of(0),
      PDFNumber.of(0),
    ]),
    A: pdfDoc.context.obj({
      Type: PDFName.of("Action"),
      S: PDFName.of("URI"),
      URI: PDFString.of(input.spotifyUrl),
    }),
  });

  const annotsKey = PDFName.of("Annots");
  let annots = page.node.lookup(annotsKey);
  if (!(annots instanceof PDFArray)) {
    annots = pdfDoc.context.obj([]);
    page.node.set(annotsKey, annots);
  }
  (annots as PDFArray).push(pdfDoc.context.register(linkAnnot));

  return Buffer.from(await pdfDoc.save());
}

export async function renderDoctorFlyer(input: {
  doctorName: string;
  spotifyUrl: string;
  doctorImageUrl?: string | null;
}) {
  return renderDoctorFlyerPdf(input);
}
