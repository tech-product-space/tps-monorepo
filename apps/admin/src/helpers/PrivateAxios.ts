import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";
import { getActiveWorkspace, getWorkspaceApiBaseUrl, CRM_API_BASE_URL } from "../lib/workspace";

// Base URL is resolved per request, not fixed at axios.create() time, because
// which backend a request should hit depends on which workspace (gradient /
// tps / crm) is currently active — see lib/workspace.ts and
// BACKEND-CONSOLIDATION-PLAN.md §7.3. The same identity JWT is attached
// regardless of target, since all three backends now trust CRM-issued tokens
// (see apps/backend/README.md's "Unified admin identity" section).
const resolveBaseUrl = (): string => {
  const workspace = getActiveWorkspace();
  return workspace ? getWorkspaceApiBaseUrl(workspace) : CRM_API_BASE_URL;
};

const PrivateAxios = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
});

const PrivateBlogsAxios = axios.create({
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

const PrivateUploadAxios = axios.create({
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

for (const instance of [PrivateAxios, PrivateBlogsAxios, PrivateUploadAxios]) {
  instance.interceptors.request.use((config) => {
    if (!config.baseURL) config.baseURL = resolveBaseUrl();
    return config;
  });
}

// Admin auth cookies are namespaced (admin_*) so the public site running on the
// same localhost (cookies aren't port-scoped) can't clobber the staff session.
const TOKEN_COOKIE = "admin_token";
const REFRESH_COOKIE = "admin_refreshToken";

PrivateAxios.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ------------------------- silent access-token refresh ------------------------ */
// The staff access token is short-lived. When the backend returns 401 (expired
// token), we exchange the long-lived refresh token for a new access token, then
// transparently replay the original request — so an active session (e.g. typing
// a support reply for an hour) never gets bounced to login. Only if the refresh
// itself fails do we clear the session and redirect.

const COOKIE_OPTS = { expires: 7, secure: true } as const;

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let isRefreshing = false;
let waiters: Array<(token: string | null) => void> = [];

const notifyWaiters = (token: string | null) => {
  waiters.forEach((cb) => cb(token));
  waiters = [];
};

const clearSessionAndRedirect = () => {
  Cookies.remove(TOKEN_COOKIE);
  Cookies.remove(REFRESH_COOKIE);
  Cookies.remove("user");
  Cookies.remove("currentRole");
  if (typeof window !== "undefined") {
    window.location.href = "/auth/login";
  }
};

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = Cookies.get(REFRESH_COOKIE);
  if (!refreshToken) return null;
  try {
    // Identity — and therefore refresh — always lives on the CRM backend now,
    // regardless of which workspace's data the original request was for.
    const res = await axios.post(`${CRM_API_BASE_URL}/api/v1/auth/refresh`, {
      refreshToken,
    });
    const newToken = res.data?.accessToken as string | undefined;
    if (!newToken) return null;
    Cookies.set(TOKEN_COOKIE, newToken, COOKIE_OPTS);
    return newToken;
  } catch {
    return null;
  }
};

const attachRefreshInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined;
      const status = error.response?.status;
      const url = original?.url || "";

      // Only attempt a refresh once per request, and never for the auth calls
      // themselves (a 401 there is a genuine credential failure).
      const isAuthCall =
        url.includes("/auth/refresh") || url.includes("/auth/login");

      if (status !== 401 || !original || original._retry || isAuthCall) {
        return Promise.reject(error);
      }
      original._retry = true;

      // A refresh is already in flight — queue until it resolves.
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          waiters.push((token) => {
            if (!token) return reject(error);
            original.headers.Authorization = `Bearer ${token}`;
            resolve(instance(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        notifyWaiters(newToken);
        if (!newToken) {
          clearSessionAndRedirect();
          return Promise.reject(error);
        }
        original.headers.Authorization = `Bearer ${newToken}`;
        return instance(original);
      } finally {
        isRefreshing = false;
      }
    }
  );
};

attachRefreshInterceptor(PrivateAxios);
attachRefreshInterceptor(PrivateUploadAxios);
attachRefreshInterceptor(PrivateBlogsAxios);

export { PrivateAxios, PrivateUploadAxios, PrivateBlogsAxios };
