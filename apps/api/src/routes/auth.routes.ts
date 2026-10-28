import { Router } from "express";
import { LoginSchema, RegisterSchema } from "@tipiment/shared";
import { AppError } from "../http/app-error";
import { login, register } from "../services/auth.service";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const user = await register(parsed.data);
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest("Email ou mot de passe invalide.");
    }
    const result = await login(parsed.data);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
