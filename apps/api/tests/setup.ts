import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";

process.env.NODE_ENV = "test";
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `tipiment-test-uploads-${String(process.pid)}`);
mkdirSync(process.env.UPLOADS_DIR, { recursive: true });
