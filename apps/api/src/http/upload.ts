import multer from "multer";
import { config } from "../config";

/** Mémoire : le sniff de vrais octets (magic bytes) décide, pas le Content-Type. */
export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.photos.maxBytes },
}).single("photo");

export function isMulterError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("LIMIT_")
  );
}
