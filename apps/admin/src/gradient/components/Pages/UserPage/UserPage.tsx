"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { toast } from "sonner";

import AddRoleDialog from "./AddRole/AddRoleDialog";
import AddUserDialog from "./AddUser/AddUserDialog";
import ResetPasswordDialog from "./ResetPassword/ResetPasswordDialog";
import UsersTable from "./UsersTable";

import { adminService } from "@/gradient/services/adminService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";

import { Admin, AdminRole, UpdateAdminPayload } from "@/gradient/types/admin";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/gradient/context/AuthContext";
import { useRouter } from "next/navigation";

export default function UsersPage() {
  const { admin, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<Admin[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<Admin | null>(null);

  const isSuperAdmin = admin?.role?.name === "Super Admin";

  useEffect(() => {
    if (!authLoading && admin && !isSuperAdmin) {
      router.replace("/");
    }
  }, [admin, authLoading, isSuperAdmin, router]);

  useEffect(() => {
    // Wait for AuthContext, then only fetch for a Super Admin — /admins is
    // role-enforced server-side, so firing this for anyone else is a guaranteed
    // 403 while they are being redirected away.
    if (authLoading || !isSuperAdmin) return;

    const loadData = async () => {
      try {
        const [usersData, rolesData] = await Promise.all([
          adminService.list(),
          adminService.getRoles(),
        ]);

        setUsers(usersData);
        setRoles(rolesData);
      } catch (err: unknown) {
        const forbidden = isAxiosError(err) && err.response?.status === 403;

        toast.error(
          forbidden
            ? "Only Super Admins can manage users"
            : getApiErrorMessage(err, "Failed to load users"),
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [authLoading, isSuperAdmin]);

  const handleRoleCreated = (role: AdminRole) => {
    setRoles((prev) => [...prev, role]);
  };

  const handleUserCreated = async () => {
    const usersData = await adminService.list();
    setUsers(usersData);
  };

  const handleUpdateUser = async (id: string, data: UpdateAdminPayload) => {
    try {
      await adminService.update(id, data);

      if (id === admin?.id && data.isActive === false) {
        logout();
        return;
      }

      const usersData = await adminService.list();
      setUsers(usersData);
      toast.success("User updated successfully");
    } catch (err: unknown) {
      // Refetch on failure too: the row's Select has already moved to the value
      // the server rejected (e.g. the last-Super-Admin guard), so leaving it
      // would show a role the admin does not actually have.
      adminService.list().then(setUsers).catch(() => {});

      toast.error(getApiErrorMessage(err, "Failed to update user"));
    }
  };

  const handleResendInvite = async (user: Admin) => {
    try {
      const res = await adminService.resendInvite(
        user.id,
        `${window.location.origin}/set-password`,
      );

      toast.success(res.message);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to resend the invite"));
    }
  };

  const handleResetDone = async () => {
    setResetTarget(null);

    // A reset can flip inviteStatus, which decides whether the row offers
    // "Resend invite" or "Reset password".
    const usersData = await adminService.list();
    setUsers(usersData);
  };

  // Renders nothing for anyone else — including while AuthContext is still
  // resolving — so the table never flashes before the redirect above fires.
  if (!isSuperAdmin) return null;

  return (
    <DashboardLayout
      title="Users"
      actions={
        <div className="flex gap-2">
          <AddRoleDialog onCreated={handleRoleCreated} />
          <AddUserDialog roles={roles} onCreated={handleUserCreated} />
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <UsersTable
          users={users}
          roles={roles}
          currentAdminId={admin?.id}
          onUpdate={handleUpdateUser}
          onResendInvite={handleResendInvite}
          onResetPassword={setResetTarget}
        />
      )}

      <ResetPasswordDialog user={resetTarget} onClose={handleResetDone} />
    </DashboardLayout>
  );
}
