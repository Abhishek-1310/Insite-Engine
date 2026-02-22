import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

/**
 * Standard JSON response helper
 */
export function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Error response helper
 */
export function errorResponse(
  statusCode: number,
  message: string,
  details?: string
): APIGatewayProxyResultV2 {
  console.error(`[ERROR ${statusCode}]: ${message}`, details || "");
  return jsonResponse(statusCode, {
    error: message,
    ...(details ? { details } : {}),
  });
}

/**
 * Parse JSON body from API Gateway event
 */
export function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    throw new Error("Request body is required");
  }

  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString()
      : event.body;
    return JSON.parse(body) as T;
  } catch {
    throw new Error("Invalid JSON in request body");
  }
}
