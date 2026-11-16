import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ValidationError } from "yup";
import { QueryFailedError } from "typeorm";

/**
 * Centralized Express Error Handling Middleware.
 * Catches unhandled errors from asynchronous routes, classifies them,
 * and responds with appropriate HTTP status codes and error messages,
 * ensuring the Node.js process never unexpectedly terminates.
 */
export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If response headers have already been sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  console.error(`[Unhandled Route Error] ${req.method} ${req.originalUrl || req.url}:`, err);

  // 1. Yup Validation Errors (Bad Request)
  if (err instanceof ValidationError || err?.name === "ValidationError") {
    return res.status(400).send(err.errors || [err.message]);
  }

  // 2. MySQL / TypeORM Database Errors
  if (
    err instanceof QueryFailedError ||
    err?.name === "QueryFailedError" ||
    (typeof err?.code === "string" && err.code.startsWith("ER_"))
  ) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).send("Duplicate entry: A record with this identifier already exists.");
    }
    if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
      return res.status(400).send("Foreign key violation: Referenced record does not exist.");
    }
    if (err.code === "ER_BAD_FIELD_ERROR" || err.code === "ER_NO_SUCH_TABLE") {
      return res.status(500).send("Database schema error: Missing column or table. Run database migrations.");
    }
    return res.status(500).send(err.message || "A database error occurred.");
  }

  // 3. Blockchain / Truffle / Web3 Errors
  const isBlockchainError =
    Boolean(err?.receipt) ||
    Boolean(err?.reason) ||
    (typeof err?.message === "string" &&
      (err.message.includes("Returned values aren't valid") ||
        err.message.includes("Out of Gas") ||
        err.message.includes("has not been deployed to detected network") ||
        err.message.includes("CONNECTION ERROR") ||
        err.message.includes("Failed to subscribe") ||
        err.message.includes("revert") ||
        err.message.includes("Sender doesn't have enough funds") ||
        err.message.includes("Invalid JSON RPC response")));

  if (isBlockchainError) {
    const errorMsg = err.reason || err.message || "Smart contract or blockchain RPC error.";
    return res.status(500).send(errorMsg);
  }

  // 4. Network Connection Refused (Ganache down, etc.)
  if (err?.code === "ECONNREFUSED") {
    return res.status(503).send("Ethereum RPC service unavailable (connection refused).");
  }

  // 5. JWT Authentication Errors
  if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
    return res.status(401).send("Invalid or expired session token.");
  }

  // 6. Explicit HTTP status codes attached to error
  const status =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
      ? err.statusCode
      : 500;

  return res.status(status).send(err.message || "Internal server error.");
};

export default errorHandler;
