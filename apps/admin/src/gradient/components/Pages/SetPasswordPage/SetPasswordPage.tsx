"use client";

import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import SetPasswordForm from "@/gradient/components/auth/SetPasswordForm";

export default function SetPasswordPage() {
    const params = useSearchParams();
    const token = params.get("token");

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6">
                <div className="max-w-md text-center space-y-4">
                    <AlertTriangle className="mx-auto text-red-500" size={32} />

                    <h2 className="text-lg font-semibold">
                        Invalid Invite Link
                    </h2>

                    <p className="text-sm text-muted-foreground">
                        The invite link is missing or invalid.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted p-6">
            <div className="w-full max-w-md">
                <SetPasswordForm token={token} />
            </div>
        </div>
    );
}