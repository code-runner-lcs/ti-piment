import type { SessionUser } from "@tipiment/shared";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
