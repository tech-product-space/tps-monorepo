import Cookies from "js-cookie";

export const resolveStorageUrl = (key?: string): string => {
  if (!key) return "";

  const baseUrl = process.env.NEXT_PUBLIC_AWS_FILE_BASE_URL_GRADIENT;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_AWS_FILE_BASE_URL_GRADIENT is not defined");
  }

  return `${baseUrl}/${key}`;
};

const isBrowser = typeof window !== "undefined";

const storage = {
  get: (key: string) => {
    if (!isBrowser) return null;
    return localStorage.getItem(key);
  },

  set: (key: string, value: string) => {
    if (!isBrowser) return;
    localStorage.setItem(key, value);
  },

  remove: (key: string) => {
    if (!isBrowser) return;
    localStorage.removeItem(key);
  },

  clear: () => {
    if (!isBrowser) return;
    localStorage.clear();
  },
};

// Auth now lives in the unified, cookie-based session (AuthProvider at
// app/layout.tsx — see BACKEND-CONSOLIDATION-PLAN.md §7.2), not gradient's
// own localStorage. These keep their original names/signatures — used
// directly by ~17 components that build a manual `fetch()` Authorization
// header instead of going through PrivateAxios — but now just proxy the
// shared `admin_token`/`user` cookies rather than a separate local copy.

export const setAdminToken = (token: string) => {
  Cookies.set("admin_token", token, { expires: 7, secure: true });
};

export const getAdminToken = () => {
  return Cookies.get("admin_token") ?? null;
};

export const removeAdminToken = () => {
  Cookies.remove("admin_token");
};

export const getAdminUser = () => {
  const user = Cookies.get("user");
  if (!user) return null;
  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
};

export const setAdminUser = (user: any) => {
  Cookies.set("user", JSON.stringify(user), { expires: 7, secure: true });
};

export const removeAdminUser = () => {
  Cookies.remove("user");
};

export default storage;