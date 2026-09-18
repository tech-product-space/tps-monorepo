import { isAxiosError } from "axios";

/**
 * Pull a human-readable message out of whatever a failed request threw.
 *
 * The backend answers expected failures with `{ message }`, so that is what an
 * admin should see — a 409 "already registered" is information, not a crash.
 * Anything without one falls back to the caller's wording rather than leaking
 * an axios string into a toast.
 */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)
      ?.message;
    if (message) return message;
  }

  return fallback;
};
