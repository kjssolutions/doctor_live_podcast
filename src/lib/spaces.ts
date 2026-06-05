import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function readStorageEnv() {
  const bucket =
    process.env.STORAGE_BUCKET ?? process.env.DIGITALOCEAN_SPACES_BUCKET;
  const endpoint =
    process.env.STORAGE_ENDPOINT ?? process.env.DIGITALOCEAN_SPACES_ENDPOINT;
  const region =
    process.env.STORAGE_REGION ??
    process.env.DIGITALOCEAN_SPACES_REGION ??
    "us-east-1";
  const accessKeyId =
    process.env.STORAGE_ACCESS_KEY_ID ??
    process.env.accessKeyId ??
    process.env.DIGITALOCEAN_SPACES_KEY;
  const secretAccessKey =
    process.env.STORAGE_SECRET_ACCESS_KEY ??
    process.env.secretAccessKey ??
    process.env.DIGITALOCEAN_SPACES_SECRET;
  const publicBaseUrl =
    process.env.STORAGE_PUBLIC_BASE_URL ??
    process.env.STORAGE_CDN_URL ??
    process.env.DIGITALOCEAN_SPACES_CDN_URL;

  const objectAcl =
    process.env.STORAGE_OBJECT_ACL?.trim() || "public-read";

  return {
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
    objectAcl,
  };
}

/** ACL for new uploads so CDN URLs in the DB work in the browser (default: public-read). */
export function getStorageObjectAcl() {
  return readStorageEnv().objectAcl || "public-read";
}

export function getSpacesConfig() {
  const config = readStorageEnv();

  if (
    !config.bucket ||
    !config.endpoint ||
    !config.accessKeyId ||
    !config.secretAccessKey
  ) {
    throw new Error(
      "Storage is not configured. Set STORAGE_BUCKET, STORAGE_ENDPOINT, accessKeyId, and secretAccessKey.",
    );
  }

  return {
    bucket: config.bucket,
    endpoint: config.endpoint,
    region: config.region,
    publicBaseUrl: config.publicBaseUrl,
  };
}

/** CDN / public base, e.g. https://scivision.sgp1.cdn.digitaloceanspaces.com */
export function getStoragePublicBaseUrl() {
  const { bucket, endpoint, publicBaseUrl } = getSpacesConfig();

  if (publicBaseUrl) {
    return publicBaseUrl.replace(/\/$/, "");
  }

  const base = new URL(
    endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
  );
  const region = base.hostname.split(".")[0];

  return `https://${bucket}.${region}.cdn.digitaloceanspaces.com`;
}

export function getSpacesClient() {
  const config = readStorageEnv();

  if (
    !config.bucket ||
    !config.endpoint ||
    !config.accessKeyId ||
    !config.secretAccessKey
  ) {
    throw new Error("Storage credentials are not configured.");
  }

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function encodeObjectKeyPath(objectKey: string) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Full public CDN URL matching the DigitalOcean Spaces UI
 * (https://{bucket}.{region}.cdn.digitaloceanspaces.com/{key})
 */
export function buildStorageUrl(objectKey: string) {
  const key = objectKey.trim().replace(/^\//, "");
  return `${getStoragePublicBaseUrl()}/${encodeObjectKeyPath(key)}`;
}

/** Fix legacy origin URLs saved without .cdn. in the hostname. */
export function fixStorageUrlHost(url: string) {
  if (!url.includes("digitaloceanspaces.com")) {
    return url;
  }

  if (url.includes(".cdn.digitaloceanspaces.com")) {
    return url;
  }

  return url.replace(
    /\.digitaloceanspaces\.com/gi,
    ".cdn.digitaloceanspaces.com",
  );
}

export function isFullStorageUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

/** Always returns the canonical CDN URL for DB storage and display. */
export function normalizeStorageUrlForDb(storageUrlOrKey: string) {
  const trimmed = storageUrlOrKey.trim();
  if (isFullStorageUrl(trimmed)) {
    return fixStorageUrlHost(trimmed);
  }
  return buildStorageUrl(trimmed);
}

/** Accepts a full storage URL or a legacy object key path. */
export function parseStorageKey(storageUrlOrKey: string) {
  const trimmed = storageUrlOrKey.trim();
  if (!isFullStorageUrl(trimmed)) {
    return trimmed.replace(/^\//, "");
  }

  const url = new URL(fixStorageUrlHost(trimmed));
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function putObjectParams(input: { key: string; mimeType: string; body?: Buffer }) {
  const { bucket } = getSpacesConfig();
  const acl = getStorageObjectAcl();

  return {
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType,
    ...(input.body ? { Body: input.body } : {}),
    ...(acl ? { ACL: acl as "public-read" } : {}),
  };
}

/** Makes an existing object readable via its CDN URL. */
export async function makeObjectPublic(objectKey: string) {
  const { bucket } = getSpacesConfig();
  const acl = getStorageObjectAcl();
  if (!acl) {
    return;
  }

  const client = getSpacesClient();
  await client.send(
    new PutObjectAclCommand({
      Bucket: bucket,
      Key: objectKey.replace(/^\//, ""),
      ACL: acl as "public-read",
    }),
  );
}

export async function uploadObject(input: {
  key: string;
  body: Buffer;
  mimeType: string;
}) {
  const client = getSpacesClient();

  await client.send(
    new PutObjectCommand(putObjectParams({ ...input, body: input.body })),
  );

  return buildStorageUrl(input.key);
}

export async function createSignedUploadUrl(input: {
  key: string;
  mimeType: string;
}) {
  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const acl = getStorageObjectAcl();
  const command = new PutObjectCommand(putObjectParams(input));

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 10 });

  return {
    uploadUrl,
    headers: {
      "Content-Type": input.mimeType,
      ...(acl ? { "x-amz-acl": acl } : {}),
    },
  };
}

export async function deleteObject(storageUrlOrKey: string) {
  const key = parseStorageKey(storageUrlOrKey);
  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function createSignedDownloadUrl(storageUrlOrKey: string) {
  const key = parseStorageKey(storageUrlOrKey);
  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}
