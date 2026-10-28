/** Réponses conformes au CDC §7.1 : { data, meta? } et erreurs { code, message } */
export type ApiOk<T> = { data: T };
export type ApiError = { code: string; message: string };
export type ApiResult<T> = ApiOk<T> | ApiError;

export function isApiError<T>(r: ApiResult<T>): r is ApiError {
  return typeof (r as Partial<ApiError>).code === "string";
}
