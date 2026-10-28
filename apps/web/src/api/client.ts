import {
  isApiError,
  type AccessTokenPayload,
  type ApiOk,
  type ApiResult,
  type LoginInput,
  type RegisterInput,
  type SessionUser,
} from "@tipiment/shared";
import { clearSession, session } from "../store/session";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = session()?.accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, {
    ...init,
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await res.json()) as ApiResult<unknown>;
  if (isApiError(payload)) {
    if (res.status === 401) clearSession();
    throw new ApiClientError(payload.code, payload.message, res.status);
  }
  return (payload as ApiOk<T>).data;
}

export const api = {
  register: (input: RegisterInput) =>
    request<SessionUser>("/api/auth/register", { method: "POST", body: input }),
  login: (input: LoginInput) =>
    request<AccessTokenPayload>("/api/auth/login", { method: "POST", body: input }),
  me: () => request<SessionUser>("/api/me"),
  hello: () => request<{ message: string }>("/api/me/hello"),
};
