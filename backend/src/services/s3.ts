import { S3 } from "aws-sdk";

const s3 = new S3();

/**
 * Generate a pre-signed URL for direct S3 upload from the browser
 */
export async function generatePresignedUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn: number = 300
): Promise<string> {
  return s3.getSignedUrlPromise("putObject", {
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Expires: expiresIn,
  });
}

/**
 * Download a file from S3 as a Buffer
 */
export async function getFileFromS3(
  bucket: string,
  key: string
): Promise<Buffer> {
  const result = await s3
    .getObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();

  return result.Body as Buffer;
}

/**
 * List all PDF files in the S3 bucket
 */
export async function listFiles(
  bucket: string,
  prefix: string = ""
): Promise<S3.ObjectList> {
  const result = await s3
    .listObjectsV2({
      Bucket: bucket,
      Prefix: prefix,
    })
    .promise();

  return result.Contents || [];
}

/**
 * Delete a file from S3
 */
export async function deleteFile(
  bucket: string,
  key: string
): Promise<void> {
  await s3
    .deleteObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();
}
