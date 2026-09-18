"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Loader2, Eye, EyeOff } from "lucide-react";

import { cn } from "@/gradient/lib/utils";
import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";


import { Button } from "@/gradient/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";

import { Field, FieldGroup, FieldLabel } from "@/gradient/components/ui/field";
import { Input } from "@/gradient/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/gradient/context/AuthContext";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const {login} = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      setLoading(true);

      const res = await PrivateAxios.post("/admins/auth/login", data);

      login(res.data.token, res.data.admin)

      toast.success("Welcome back to Gradient Admin");

      router.push("/");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Invalid email or password"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="w-100 mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Login with your admin credentials
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FieldGroup>
              {/* Email */}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>

                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  disabled={loading}
                  {...form.register("email")}
                />

                {form.formState.errors.email && (
                  <p className="text-xs text-red-500 mt-1">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </Field>

              {/* Password */}
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>

                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    disabled={loading}
                    {...form.register("password")}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>

                {form.formState.errors.password && (
                  <p className="text-xs text-red-500 mt-1">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </Field>

              {/* Submit */}
              <Field>
                <Button
                  type="submit"
                  className="w-full h-10"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    "Login"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}