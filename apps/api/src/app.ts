import express from "express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./http/app-error";
import { isMulterError } from "./http/upload";
import { AppDataSource } from "./data-source";
import { config } from "./config";
import { authRouter } from "./routes/auth.routes";
import { meRouter } from "./routes/me.routes";
import { adminRouter } from "./routes/admin.routes";

const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ code: "NOT_FOUND", message: "Route inconnue" });
};

const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): void => {
  let mapped: unknown = err;
  const maybe = mapped as { type?: string; code?: string } | null;
  if (maybe?.type === "entity.parse.failed") {
    mapped = AppError.badRequest("Corps JSON invalide", "INVALID_JSON");
  } else if (isMulterError(err)) {
    mapped =
      err.code === "LIMIT_FILE_SIZE"
        ? new AppError(413, "PHOTO_TOO_LARGE", "Photo trop lourde (8 Mo maximum).")
        : AppError.badRequest(`Upload refusé: ${err.code}`, "UPLOAD_REJECTED");
  }
  if (mapped instanceof AppError) {
    res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
    return;
  }
  console.error("[api] erreur non gérée:", mapped);
  res.status(500).json({ code: "INTERNAL", message: "Erreur interne" });
};

export interface AppDeps {
  staticDir?: string;
}

export async function buildApp(deps: AppDeps = {}): Promise<express.Express> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/admin", adminRouter);

  // Photos servies en statique (uuid non devinables) — cache 7 j
  app.use("/uploads", express.static(deps.staticDir ?? config.photos.uploadsDir, { maxAge: "7d", immutable: true }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
