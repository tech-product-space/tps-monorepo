import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import {
  Admin,
  AdminRole,
  CreateAdminPayload,
  CreateAdminResponse,
  ResendInviteResponse,
  ResetPasswordPayload,
  ResetPasswordResponse,
  UpdateAdminPayload,
} from "@/gradient/types/admin";

const BASE = "/admins";

export const adminService = {
  list: async (): Promise<Admin[]> => {
    const res = await PrivateAxios.get(BASE);
    return res.data;
  },

  getRoles: async () => {
    const res = await PrivateAxios.get(`${BASE}/roles`);
    return res.data;
  },

  create: async (data: CreateAdminPayload): Promise<CreateAdminResponse> => {
    const res = await PrivateAxios.post(BASE, data);
    return res.data;
  },

  createRole: async (data: { name: string }): Promise<AdminRole> => {
    const res = await PrivateAxios.post(`${BASE}/roles`, data);
    return res.data;
  },

  update: async (id: string, data: UpdateAdminPayload): Promise<Admin> => {
    const res = await PrivateAxios.patch(`${BASE}/${id}`, data);
    return res.data;
  },

  resendInvite: async (
    id: string,
    passwordResetPageUrl: string,
  ): Promise<ResendInviteResponse> => {
    const res = await PrivateAxios.post(`${BASE}/${id}/resend-invite`, {
      passwordResetPageUrl,
    });
    return res.data;
  },

  resetPassword: async (
    id: string,
    data: ResetPasswordPayload,
  ): Promise<ResetPasswordResponse> => {
    const res = await PrivateAxios.post(`${BASE}/${id}/reset-password`, data);
    return res.data;
  },
};
