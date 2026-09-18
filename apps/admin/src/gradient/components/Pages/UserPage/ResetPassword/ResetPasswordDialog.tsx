"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

import { Admin, ResetPasswordMode } from "@/gradient/types/admin";
import { adminService } from "@/gradient/services/adminService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  generateTemporaryPassword,
} from "@/gradient/lib/adminPassword";

import CopyField from "../CopyField";
import { Loader2, RefreshCw } from "lucide-react";

type Props = {
  /** The row being reset; null closes the dialog. */
  user: Admin | null;
  onClose: () => void;
};

type Result =
  | { kind: "link"; resetLink: string; emailed: boolean }
  | { kind: "temporary"; password: string; emailed: boolean };

const MODES: { value: ResetPasswordMode; label: string; hint: string }[] = [
  {
    value: "link",
    label: "Email a reset link",
    hint: "They choose their own password. Nobody else ever sees it.",
  },
  {
    value: "temporary",
    label: "Set a temporary password",
    hint: "Use when they need access immediately and you can tell them directly.",
  },
];

export default function ResetPasswordDialog({ user, onClose }: Props) {
  const [mode, setMode] = useState<ResetPasswordMode>("link");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Each row opens a fresh dialog — without this, the previous admin's result
  // would still be on screen when the next one is opened.
  useEffect(() => {
    if (user) {
      setMode("link");
      setPassword(generateTemporaryPassword());
      setResult(null);
    }
  }, [user]);

  const submit = async () => {
    if (!user) return;

    if (mode === "temporary" && password.length < ADMIN_PASSWORD_MIN_LENGTH) {
      toast.error(
        `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
      );
      return;
    }

    try {
      setSubmitting(true);

      const res = await adminService.resetPassword(user.id, {
        mode,
        ...(mode === "temporary"
          ? { password, loginUrl: `${window.location.origin}/login` }
          : { resetPageUrl: `${window.location.origin}/set-password` }),
      });

      toast.success(res.message);

      setResult(
        mode === "temporary"
          ? { kind: "temporary", password, emailed: res.emailed }
          : { kind: "link", resetLink: res.resetLink || "", emailed: res.emailed },
      );
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to reset password"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {user?.name} · {user?.email}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    mode === option.value
                      ? "border-primary bg-accent"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.hint}
                  </p>
                </button>
              ))}
            </div>

            {mode === "temporary" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Temporary password
                </Label>

                <div className="flex gap-2">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono tracking-wide"
                    minLength={ADMIN_PASSWORD_MIN_LENGTH}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    title="Generate a new password"
                    onClick={() => setPassword(generateTemporaryPassword())}
                  >
                    <RefreshCw size={16} />
                  </Button>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : mode === "temporary" ? (
                "Set temporary password"
              ) : (
                "Send reset link"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.emailed
                ? `Emailed to ${user?.email}. You can also share this directly:`
                : `The email to ${user?.email} failed to send — share this directly:`}
            </p>

            {result.kind === "link" ? (
              <>
                <CopyField label="Reset link" value={result.resetLink} />
                <p className="text-xs text-muted-foreground">
                  The link expires in 1 hour. Their current password keeps
                  working until they set a new one.
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
                  Their old password no longer works. This is the only time the
                  new one is shown.
                </p>
              </>
            )}

            <Button variant="outline" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
