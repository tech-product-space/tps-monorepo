"use client";

import { Admin, AdminRole, UpdateAdminPayload } from "@/gradient/types/admin";
import { formatLastLogin } from "@/gradient/lib/adminPassword";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import { KeyRound, Mail, MoreHorizontal } from "lucide-react";

type Props = {
  users: Admin[];
  roles: AdminRole[];
  /** The signed-in admin, so their own row can be treated differently. */
  currentAdminId?: string;
  onUpdate: (id: string, data: UpdateAdminPayload) => void;
  onResendInvite: (user: Admin) => void;
  onResetPassword: (user: Admin) => void;
};

export default function UsersTable({
  users,
  roles,
  currentAdminId,
  onUpdate,
  onResendInvite,
  onResetPassword,
}: Props) {
  if (!users.length) {
    return (
      <div className="border rounded-lg bg-white p-10 text-center text-sm text-muted-foreground">
        No users found
      </div>
    );
  }

  const getStatus = (user: Admin) => {
    const isUserSuperAdmin = user.role?.name === "Super Admin";

    return (
      <div className="flex items-center gap-3">
        {user.inviteStatus === "pending" ? (
          <Badge variant="secondary">Pending Invite</Badge>
        ) : (
          <Badge className={user.isActive ? "bg-green-600" : "bg-destructive"}>
            {user.isActive ? "Active" : "Disabled"}
          </Badge>
        )}

        {!isUserSuperAdmin && (
          <Switch
            checked={user.isActive}
            onCheckedChange={(checked) =>
              onUpdate(user.id, { isActive: checked })
            }
          />
        )}
      </div>
    );
  };

  return (
    <div className="border rounded-lg bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-[190px]">Role</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentAdminId;
            const isPending = user.inviteStatus === "pending";
            const lastLogin = formatLastLogin(user.lastLogin);

            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name}
                  {isSelf && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </TableCell>

                <TableCell>{user.email}</TableCell>

                <TableCell>
                  {/* Editing your own role is the one change you cannot undo
                      yourself — the page disappears the moment it saves. */}
                  {isSelf ? (
                    <span className="text-sm">{user.role?.name}</span>
                  ) : (
                    <Select
                      value={user.role?.id}
                      onValueChange={(roleId) => {
                        if (roleId !== user.role?.id) {
                          onUpdate(user.id, { roleId });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue placeholder="No role" />
                      </SelectTrigger>

                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {lastLogin || (isPending ? "—" : "Never")}
                </TableCell>

                <TableCell>{getStatus(user)}</TableCell>

                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-48">
                      {/* The two are mutually exclusive: an admin either has a
                          password or is still sitting on an unused invite. */}
                      {isPending ? (
                        <DropdownMenuItem onClick={() => onResendInvite(user)}>
                          <Mail className="mr-2 h-4 w-4" />
                          Resend invite
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => onResetPassword(user)}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Reset password
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
