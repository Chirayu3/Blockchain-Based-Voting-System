import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Reusable asynchronous route error handler wrapper for Express 4.
 * Catches rejected promises and forwards errors to the centralized error middleware.
 */
export const asyncHandler = (
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
