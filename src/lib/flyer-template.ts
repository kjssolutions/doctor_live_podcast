import path from "node:path";

import QRCode from "qrcode";
import sharp from "sharp";

/** Template pixel size (1893×2483 @ 300dpi) */
export const FLYER_WIDTH = 1893;
export const FLYER_HEIGHT = 2483;

/** Layout tuned for public/flyer/Podcast flyer.jpg.jpeg */
const LAYOUT = {
  photoCenterX: Math.round(FLYER_WIDTH * 0.5),
  photoCenterY: Math.round(FLYER_HEIGHT * 0.275),
  photoDiameter: Math.round(FLYER_WIDTH * 0.255),
  nameY: Math.round(FLYER_HEIGHT * 0.395),
  nameFontSize: 56,
  qrLeft: Math.round(FLYER_WIDTH * 0.735),
  qrTop: Math.round(FLYER_HEIGHT * 0.835),
  qrSize: Math.round(FLYER_WIDTH * 0.155),
} as const;

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public/flyer/Podcast flyer.jpg.jpeg",
);

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
  const qrBuffer = await QRCode.toBuffer(spotifyUrl, {
    type: "png",
    width: LAYOUT.qrSize,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });

  const padded = await sharp(qrBuffer)
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  return padded;
}

export async function renderDoctorFlyer(input: {
  doctorName: string;
  spotifyUrl: string;
  doctorImageUrl?: string | null;
}) {
  const template = sharp(TEMPLATE_PATH);
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

  return template
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
