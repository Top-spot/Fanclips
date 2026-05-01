export type ApiResult<T> =
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: string;
    };

export const ok = <T>(data: T): ApiResult<T> => ({ data, error: null });

export const fail = <T = never>(error: string): ApiResult<T> => ({ data: null, error });
