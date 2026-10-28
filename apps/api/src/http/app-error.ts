export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, code = "VALIDATION_ERROR") {
    return new AppError(400, code, message);
  }
  static unauthorized(message = "Authentification requise") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
}
