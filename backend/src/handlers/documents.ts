import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { config } from "../config";
import { listFiles, deleteFile } from "../services/s3";
import { deleteVectorsByDocument } from "../services/pinecone";
import { jsonResponse, errorResponse } from "../utils/response";

/**
 * Handler: List all uploaded documents
 * GET /documents
 */
export async function listDocuments(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    console.log("📄 Listing documents...");

    // List all objects in the uploads prefix
    const files = await listFiles(config.uploadBucket, "uploads/");

    // Group by documentId (folder structure: uploads/{documentId}/{fileName})
    const documentsMap = new Map<
      string,
      {
        documentId: string;
        fileName: string;
        s3Key: string;
        size: number;
        lastModified: string;
      }
    >();

    for (const file of files) {
      if (!file.Key) continue;

      const parts = file.Key.split("/");
      if (parts.length < 3) continue; // Skip malformed keys

      const documentId = parts[1];
      const fileName = parts[parts.length - 1];

      if (!documentsMap.has(documentId)) {
        documentsMap.set(documentId, {
          documentId,
          fileName,
          s3Key: file.Key,
          size: file.Size || 0,
          lastModified: file.LastModified?.toISOString() || "",
        });
      }
    }

    const documents = Array.from(documentsMap.values()).sort(
      (a, b) =>
        new Date(b.lastModified).getTime() -
        new Date(a.lastModified).getTime()
    );

    console.log(`Found ${documents.length} documents`);

    return jsonResponse(200, {
      documents,
      count: documents.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return errorResponse(500, "Failed to list documents", message);
  }
}

/**
 * Handler: Delete a document and its vectors
 * DELETE /documents/{documentId}
 */
export async function deleteDocument(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const documentId = event.pathParameters?.documentId;

    if (!documentId) {
      return errorResponse(400, "Document ID is required");
    }

    console.log(`🗑️ Deleting document: ${documentId}`);

    // Delete from S3 (list files in the document folder first)
    const files = await listFiles(
      config.uploadBucket,
      `uploads/${documentId}/`
    );

    for (const file of files) {
      if (file.Key) {
        await deleteFile(config.uploadBucket, file.Key);
        console.log(`Deleted S3 object: ${file.Key}`);
      }
    }

    // Delete vectors from Pinecone
    await deleteVectorsByDocument(documentId);
    console.log(`Deleted vectors for document: ${documentId}`);

    return jsonResponse(200, {
      message: `Document ${documentId} deleted successfully`,
      documentId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return errorResponse(500, "Failed to delete document", message);
  }
}
