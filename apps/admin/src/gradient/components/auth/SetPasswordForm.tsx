"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { ADMIN_PASSWORD_MIN_LENGTH } from "@/gradient/lib/adminPassword";

type Props = {
  token: string;
};

type FormData = {
  password: string;
  confirmPassword: string;
};

export default function SetPasswordForm({ token }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>();

  const password = watch("password");

  const onSubmit = async (data: FormData) => {
    if (data.password !== data.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setLoading(true);

      await PrivateAxios.post("/admins/auth/set-password", {
        token,
        password: data.password,
      });

      toast.success("Password set successfully");

      router.push("/login");
    } catch (err: any) {
      // This form now serves both invites and Super-Admin-initiated resets, so
      // the fallback can't assume which link the admin followed.
      toast.error(err?.response?.data?.message || "Invalid or expired link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 border rounded-lg bg-white p-6"
    >
      <h2 className="text-lg font-semibold text-center">
        Set Your Password
      </h2>

      {/* Password */}
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          {...register("password", {
            required: "Password is required",
            minLength: {
              value: ADMIN_PASSWORD_MIN_LENGTH,
              message: `Minimum ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
            },
          })}
        />

        <button
          type="button"
          onClick={() => setShowPassword((p) => !p)}
          className="absolute right-3 top-1/2 -translate-y-1/2"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>

        {errors.password && (
          <p className="text-xs text-red-500 mt-1">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <Input
        type={showPassword ? "text" : "password"}
        placeholder="Confirm password"
        {...register("confirmPassword", {
          required: "Confirm your password",
          validate: (value) =>
            value === password || "Passwords do not match",
        })}
      />

      {errors.confirmPassword && (
        <p className="text-xs text-red-500">
          {errors.confirmPassword.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          "Set Password"
        )}
      </Button>
    </form>
  );
}