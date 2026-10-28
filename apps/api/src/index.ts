import express from "express";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { AppDataSource } from "./data-source";
import { authRouter } from "./routes/auth.routes";
import { meRouter } from "./routes/me.routes";
import { AppError } from "./http/app-error";
import { config } from "./config";

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: "NOT_FOUND", message: "Route inconnue" });
  });

  const errorHandler: ErrorRequestHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    let mapped: unknown = err;
    // JSON malformé (body-parser)
    const maybe = mapped as { type?: string } | null;
    if (maybe?.type === "entity.parse.failed") {
      mapped = AppError.badRequest("Corps JSON invalide", "INVALID_JSON");
    }
    if (mapped instanceof AppError) {
      res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
      return;
    }
    console.error("[api] erreur non gérée:", mapped);
    res.status(500).json({ code: "INTERNAL", message: "Erreur interne" });
  };
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[api] prêt sur http://localhost:${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error("[api] démarrage impossible:", err);
  process.exit(1);
});
