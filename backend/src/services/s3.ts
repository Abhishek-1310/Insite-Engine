import { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});

/**
 * Generate a pre-signed URL for direct S3 upload from the browser
 * Note: We disable checksum so browsers can PUT without CRC32 headers
 */
export async function generatePresignedUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn: number = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, {
    expiresIn,
    unhoistableHeaders: new Set(["x-amz-checksum-crc32"]),
  });
}

/**
 * Download a file from S3 as a Buffer
 */
export async function getFileFromS3(
  bucket: string,
  key: string
): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const result = await s3.send(command);
  const stream = result.Body as NodeJS.ReadableStream;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * List all files in the S3 bucket
 */
export async function listFiles(
  bucket: string,
  prefix: string = ""
): Promise<{ Key?: string; Size?: number; LastModified?: Date }[]> {
  const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
  const result = await s3.send(command);
  return result.Contents || [];
}

/**
 * Delete a file from S3
 */
export async function deleteFile(
  bucket: string,
  key: string
): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await s3.send(command);
}
