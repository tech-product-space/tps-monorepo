"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/gradient/components/ui/dialog";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/gradient/components/ui/select";

import { useForm } from "react-hook-form";
import { AdminRole } from "@/gradient/types/admin";
import { useAuth } from "@/gradient/context/AuthContext";
import { adminService } from "@/gradient/services/adminService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import {
    ADMIN_PASSWORD_MIN_LENGTH,
    generateTemporaryPassword,
} from "@/gradient/lib/adminPassword";

import CopyField from "../CopyField";
import { Loader2, RefreshCw } from "lucide-react";

type FormData = {
    name: string;
    email: string;
    roleId: string;
};

type Props = {
    roles?: AdminRole[];
    onCreated?: () => void;
};

/** What to show after a successful create, depending on which flow ran. */
type Result =
    | { kind: "invite"; inviteLink: string; emailed: boolean; email: string }
    | { kind: "password"; password: string; emailed: boolean; email: string };

export default function AddUserDialog({ roles = [], onCreated }: Props) {
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Off by default: an emailed invite means nobody but the new admin ever
    // knows their password. The temporary password is the escape hatch for
    // "they need access on this call".
    const [useTempPassword, setUseTempPassword] = useState(false);
    const [tempPassword, setTempPassword] = useState("");

    const { admin } = useAuth();

    const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>();

    const isSuperAdmin = admin?.role?.name === "Super Admin";
    const selectedRoleId = watch("roleId");

    const resetDialog = () => {
        setResult(null);
        setUseTempPassword(false);
        setTempPassword("");
        reset();
    };

    const toggleTempPassword = (enabled: boolean) => {
        setUseTempPassword(enabled);
        setTempPassword(enabled ? generateTemporaryPassword() : "");
    };

    const onSubmit = async (data: FormData) => {
        if (!data.roleId) {
            toast.error("Select a role");
            return;
        }

        if (useTempPassword && tempPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
            toast.error(
                `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
            );
            return;
        }

        try {
            setSubmitting(true);

            const res = await adminService.create({
                ...data,
                ...(useTempPassword
                    ? {
                          password: tempPassword,
                          loginUrl: `${window.location.origin}/login`,
                      }
                    : {
                          passwordResetPageUrl: `${window.location.origin}/set-password`,
                      }),
            });

            toast.success(
                res.emailed
                    ? `User created — email sent to ${data.email}`
                    : "User created, but the email could not be sent",
            );

            setResult(
                useTempPassword
                    ? {
                          kind: "password",
                          password: tempPassword,
                          emailed: res.emailed,
                          email: data.email,
                      }
                    : {
                          kind: "invite",
                          inviteLink: res.inviteLink || "",
                          emailed: res.emailed,
                          email: data.email,
                      },
            );

            onCreated?.();

            reset();
        } catch (err: unknown) {
            toast.error(getApiErrorMessage(err, "Failed to create user"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(value) => {
            setOpen(value);

            if (!value) resetDialog();
        }}>
            <DialogTrigger asChild>
                <Button>Create User</Button>
            </DialogTrigger>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add User</DialogTitle>
                </DialogHeader>

                {!result ? (
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                        <Input placeholder="Name" {...register("name")} required />

                        <Input
                            placeholder="Email"
                            type="email"
                            {...register("email")}
                            required
                        />

                        <Select
                            value={selectedRoleId}
                            onValueChange={(value) => setValue("roleId", value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>

                            <SelectContent>
                                {roles.map((role) => {
                                    const isSuperRole = role.name === "Super Admin";

                                    return (
                                        <SelectItem
                                            key={role.id}
                                            value={role.id}
                                            disabled={!isSuperAdmin && isSuperRole}
                                        >
                                            {role.name}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>

                        <div className="rounded-lg border p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <Label className="text-sm">
                                        Set a temporary password
                                    </Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {useTempPassword
                                            ? "They can sign in right away and should change it."
                                            : "Otherwise they get an emailed invite link."}
                                    </p>
                                </div>

                                <Switch
                                    checked={useTempPassword}
                                    onCheckedChange={toggleTempPassword}
                                />
                            </div>

                            {useTempPassword && (
                                <div className="flex gap-2">
                                    <Input
                                        value={tempPassword}
                                        onChange={(e) => setTempPassword(e.target.value)}
                                        className="font-mono tracking-wide"
                                        minLength={ADMIN_PASSWORD_MIN_LENGTH}
                                        required
                                    />

                                    <Button
                                        type="button"
                                        variant="outline"
                                        title="Generate a new password"
                                        onClick={() =>
                                            setTempPassword(generateTemporaryPassword())
                                        }
                                    >
                                        <RefreshCw size={16} />
                                    </Button>
                                </div>
                            )}
                        </div>

                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? (
                                <Loader2 className="animate-spin" size={16} />
                            ) : (
                                "Create User"
                            )}
                        </Button>

                    </form>
                ) : (
                    <div className="space-y-4">

                        <p className="text-sm text-muted-foreground">
                            {result.emailed
                                ? `Sent to ${result.email}. You can also share this directly:`
                                : `The email to ${result.email} failed to send — share this directly:`}
                        </p>

                        {result.kind === "invite" ? (
                            <>
                                <CopyField label="Invite link" value={result.inviteLink} />
                                <p className="text-xs text-muted-foreground">
                                    The link expires in 24 hours. You can resend it any time
                                    from the row menu.
                                </p>
                            </>
                        ) : (
                            <>
                                <CopyField
                                    label="Temporary password"
                                    value={result.password}
                                    mono
                                />
                                <p className="text-xs text-amber-700">
                                    This is the only time it is shown. Ask them to change it
                                    after signing in.
                                </p>
                            </>
                        )}

                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
