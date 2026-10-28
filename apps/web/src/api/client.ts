import {
  isApiError,
  type CityDto,
  type AccessTokenPayload,
  type ApiOk,
  type ApiResult,
  type LoginInput,
  type PhotoDto,
  type PreferencesInput,
  type DeckDto, type MatchDto, type ProfileBundle, type QuotasDto, type SwipeInput, type SwipeResultDto,
  type ProfileInput,
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
  const isForm = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isForm) headers.set("Content-Type", "application/json");
  const token = session()?.accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, {
    ...init,
    headers,
    body: init?.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
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
  /** Cookie refresh -> nouveau cookie + nouvel access token (rotation serveur) */
  refresh: () => request<AccessTokenPayload>("/api/auth/refresh", { method: "POST" }),
  logout: () => request<{ status: string }>("/api/auth/logout", { method: "POST" }),
  verifyEmail: (token: string) =>
    request<{ status: string; email: string }>("/api/auth/verify-email", { method: "POST", body: { token } }),
  resendVerification: (email: string) =>
    request<{ status: string }>("/api/auth/resend-verification", { method: "POST", body: { email } }),
  forgotPassword: (email: string) =>
    request<{ status: string }>("/api/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token: string, password: string) =>
    request<{ status: string }>("/api/auth/reset-password", { method: "POST", body: { token, password } }),
  getProfile: () => request<ProfileBundle>("/api/me/profile"),
  saveProfile: (input: ProfileInput) =>
    request<{ status: string }>("/api/me/profile", { method: "PUT", body: input }),
  savePreferences: (input: PreferencesInput) =>
    request<{ status: string }>("/api/me/preferences", { method: "PUT", body: input }),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return request<PhotoDto>("/api/me/photos", { method: "POST", body: form });
  },
  deletePhoto: (id: string) => request<{ status: string }>(`/api/me/photos/${id}`, { method: "DELETE" }),
  deleteMe: () => request<void>("/api/me", { method: "DELETE" }),
  hello: () => request<{ message: string }>("/api/me/hello"),
  getDeck: () => request<DeckDto>("/api/deck"),
  swipe: (input: SwipeInput) => request<SwipeResultDto>("/api/swipe", { method: "POST", body: input }),
  getQuotas: () => request<QuotasDto>("/api/quotas"),
  listMatches: () => request<MatchDto[]>("/api/matches"),
  searchCities: (q: string) =>
    request<CityDto[]>(`/api/cities/search?q=${encodeURIComponent(q)}`),
};
