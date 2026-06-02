import {
  GetObjectCommand,
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

  return { bucket, endpoint, region, accessKeyId, secretAccessKey };
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
  };
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

export async function uploadObject(input: {
  key: string;
  body: Buffer;
  mimeType: string;
}) {
  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.mimeType,
    }),
  );

  return input.key;
}

export async function createSignedUploadUrl(input: {
  key: string;
  mimeType: string;
}) {
  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export async function createSignedDownloadUrl(key: string) {
  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export function getAssetLocation() {
  const config = getSpacesConfig();
  return {
    bucket: config.bucket,
    endpoint: config.endpoint,
  };
}
