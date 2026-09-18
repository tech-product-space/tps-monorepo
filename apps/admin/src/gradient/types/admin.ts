
export interface AdminRole {
  id: string;
  name: 'Super Admin' | string;
}

export type AdminInviteStatus = "pending" | "accepted";

export interface Admin {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  inviteStatus: AdminInviteStatus;
  role?: AdminRole;
  /** Written on every successful login. Null until the admin first signs in. */
  lastLogin?: string | null;
  createdAt?: string;
};

/** Every field is optional — the table PATCHes one at a time. */
export interface UpdateAdminPayload {
  name?: string;
  roleId?: string;
  isActive?: boolean;
}

export interface CreateAdminPayload {
  name: string;
  email: string;
  roleId: string;
  /** Where the invite link points. Required unless `password` is set. */
  passwordResetPageUrl?: string;
  /** Set to onboard with a temporary password instead of an invite link. */
  password?: string;
  loginUrl?: string;
}

export interface CreateAdminResponse {
  admin: Admin;
  /** Only returned for the invite flow — absent when a password was set. */
  inviteLink?: string;
  /** False when the account was created but the email could not be delivered. */
  emailed: boolean;
}

export interface ResendInviteResponse {
  message: string;
  inviteLink: string;
  emailed: boolean;
}

/** "link" emails a reset link; "temporary" sets a password chosen right now. */
export type ResetPasswordMode = "link" | "temporary";

export interface ResetPasswordPayload {
  mode: ResetPasswordMode;
  password?: string;
  resetPageUrl?: string;
  loginUrl?: string;
}

export interface ResetPasswordResponse {
  message: string;
  resetLink?: string;
  emailed: boolean;
}
