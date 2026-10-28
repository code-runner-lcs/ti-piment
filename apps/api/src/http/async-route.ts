import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 5 gère déjà les rejects — helper pour garder les handlers synchrones lisibles. */
export const asyncRoute =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
