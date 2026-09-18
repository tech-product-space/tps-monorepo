import axios from "axios";
import { PrivateAxios } from "../../helpers/PrivateAxios";
import { CRM_API_BASE_URL, getWorkspaceApiBaseUrl } from "../../lib/workspace";

// Identity lives on the CRM backend now (see BACKEND-CONSOLIDATION-PLAN.md
// §7.2) — login/signup/invite all go there directly, over a bare axios
// instance, since PrivateAxios's baseURL depends on an active workspace that
// doesn't exist yet before login.
const IdentityAxios = axios.create({
  baseURL: CRM_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export interface AuthCredentialsLogin {
  email: string;
  password: string;
}

export interface InviteToken {
  token: string;
}

export interface ISetUserPassword {
  token: string;
  password: string;
}

export interface IUpdateUser {
  name: string;
  email: string;
  role: string;
}

export interface AuthCredentialsSignup {
  name: string;
  email: string;
  password: string;
}

export interface AuthCredentialsSignupWithGoogle {
  name: string;
  email: string;
  profile_picture: string;
}

export interface AuthCredentialsLoginWithGoogle {
  email: string;
}

export const login = async (credentials: AuthCredentialsLogin) => {
  const response = await IdentityAxios.post("/api/v1/auth/login", credentials);
  return response.data;
};

// Also not yet unified — see the note above loginWithGoogle.
export const signup = async (credentials: AuthCredentialsSignup) => {
  const response = await axios
    .create({ baseURL: getWorkspaceApiBaseUrl("tps") })
    .post("/company/signup", credentials);
  return response.data;
};

export const signupWithGoogle = async (credentials: AuthCredentialsSignupWithGoogle) => {
  const response = await axios
    .create({ baseURL: getWorkspaceApiBaseUrl("tps") })
    .post("/company/signup-with-google", credentials);
  return response.data;
};

// NOT YET UNIFIED: Google login/signup/invite are still TPS-workspace-only
// endpoints (`/company/*` on the tps backend). Identity is meant to live on
// the CRM backend now (see BACKEND-CONSOLIDATION-PLAN.md §7.2), but the CRM
// backend doesn't have a Google-OAuth admin login route or an invite flow
// that writes an admin_workspace_grants row yet — that's follow-up backend
// work, not something this pass can fake convincingly. Pointed at the TPS
// backend explicitly (not the dynamic PrivateAxios baseURL) so these keep
// working for TPS admins in the meantime; Gradient/CRM admins can't use them
// until the CRM-side routes exist.
const TpsAxios = axios.create({ baseURL: getWorkspaceApiBaseUrl("tps") });

export const loginWithGoogle = async (credentials: AuthCredentialsLoginWithGoogle) => {
  const response = await TpsAxios.post("/company/login-with-google", credentials);
  return response.data;
};

export const inviteUser = async (requestbody: IUpdateUser) => {
  const response = await PrivateAxios.post("/company/invite-user", requestbody);
  return response.data;
};

export const getInviteUser = async (requestbody: InviteToken) => {
  const response = await PrivateAxios.post("/company/get-invite-user", requestbody);
  return response.data;
};

export const setUserPassword = async (requestbody: ISetUserPassword) => {
  const response = await PrivateAxios.post("/company/set-password", requestbody);
  return response.data;
};

export const getAllUsers = async () => {
  try {
    const response = await PrivateAxios.get("/company/users");
    return response.data;
  } catch (error) {
    console.error("❌ Failed to fetch quiz questions:", error);
    throw error;
  }
};

export const updateUsers = async (id: number, requestbody: IUpdateUser) => {
  try {
    const response = await PrivateAxios.post(`/company/users/${id}`, requestbody);
    return response.data;
  } catch (error) {
    console.error("❌ Failed to fetch quiz questions:", error);
    throw error;
  }
};

export const deleteUser = async (id: number) => {
  try {
    const response = await PrivateAxios.delete(`/company/users/${id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Failed to fetch quiz questions:", error);
    throw error;
  }
};

export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};
