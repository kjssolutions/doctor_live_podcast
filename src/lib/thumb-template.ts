import path from "node:path";

import sharp from "sharp";

/**
 * Full epilepsy podcast thumb — doctor photo fills the RIGHT circle on
 * public/flyer/thumb.png (left host circle stays as designed).
 */
export const THUMB_WIDTH = 1024;
export const THUMB_HEIGHT = 576;

/** Right empty circle inset on public/flyer/thumb.png */
const LAYOUT = {
  photoCenterX: 840,
  photoCenterY: 198,
  photoDiameter: 260,
} as const;

const TEMPLATE_PATH = path.join(process.cwd(), "public/flyer/thumb.png");

async function loadDoctorPhoto(
  imageUrlOrBuffer: string | Buffer | null | undefined,
) {
  if (!imageUrlOrBuffer) {
    return null;
  }

  if (Buffer.isBuffer(imageUrlOrBuffer)) {
    return imageUrlOrBuffer;
  }

  try {
    const response = await fetch(imageUrlOrBuffer);
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

export async function renderDoctorThumb(input: {
  doctorImageUrl?: string | null;
  doctorImageBuffer?: Buffer | null;
}) {
  const template = sharp(TEMPLATE_PATH);
  const photoBuffer =
    (await loadDoctorPhoto(input.doctorImageBuffer)) ??
    (await loadDoctorPhoto(input.doctorImageUrl));

  if (!photoBuffer) {
    return template.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  const circularPhoto = await buildCircularPhoto(
    photoBuffer,
    LAYOUT.photoDiameter,
  );

  return template
    .composite([
      {
        input: circularPhoto,
        left: LAYOUT.photoCenterX - Math.round(LAYOUT.photoDiameter / 2),
        top: LAYOUT.photoCenterY - Math.round(LAYOUT.photoDiameter / 2),
      },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
