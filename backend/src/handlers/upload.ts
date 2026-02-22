import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { generatePresignedUrl } from "../services/s3";
import { isSupportedImage } from "../services/image";
import { jsonResponse, errorResponse, parseBody } from "../utils/response";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

interface UploadUrlRequest {
  fileName: string;
  contentType: string;
}

/**
 * Handler: Generate a pre-signed S3 URL for direct browser upload
 * POST /upload-url
 * Supports: PDF files and images (PNG, JPEG, WebP, GIF)
 */
export async function getPresignedUrl(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const { fileName, contentType } = parseBody<UploadUrlRequest>(event);

    // Validate input
    if (!fileName || !contentType) {
      return errorResponse(400, "fileName and contentType are required");
    }

    // Allow PDF files and images
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return errorResponse(
        400,
        `Unsupported file type. Allowed: PDF, PNG, JPEG, WebP, GIF`
      );
    }

    // Generate a unique document ID and S3 key
    const documentId = uuidv4();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const s3Key = `uploads/${documentId}/${sanitizedName}`;

    // Generate pre-signed URL (valid for 5 minutes)
    const uploadUrl = await generatePresignedUrl(
      config.uploadBucket,
      s3Key,
      contentType,
      300
    );

    return jsonResponse(200, {
      uploadUrl,
      documentId,
      s3Key,
      message: "Upload URL generated successfully. URL expires in 5 minutes.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return errorResponse(500, "Failed to generate upload URL", message);
  }
}
