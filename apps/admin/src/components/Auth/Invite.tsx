"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getInviteUser,
  ISetUserPassword,
  setUserPassword,
} from "@/services/auth/authService";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const inviteFormSchema = z
  .object({
    email: z
      .string()
      .min(1, { message: "Email is required" })
      .email({ message: "Must be a valid email address" }),
    password: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" }),
    confirmPassword: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type InviteFormValues = z.infer<typeof inviteFormSchema>;

export function Invite({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: InviteFormValues) => {
    setIsLoading(true);
    setError(null);
    // Submit logic here
    setIsLoading(false);

    if (token) {
      const requestBody = {
        token: token,
        password: data.password,
      };
      console.log("Form Data:", requestBody);
      setPasswordFn(requestBody);
    }
  };

  const handleInvite = async () => {
    if (!token) {
      setError("Invalid invitation link");
      return;
    }
    const requestBody = {
      token: token,
    };
    const response = await getInviteUser(requestBody);
    if (response?.user?.email) {
      form.setValue("email", response.user.email);
    }
  };

  const setPasswordFn = async (requestBody: ISetUserPassword) => {
    const response = await setUserPassword(requestBody);
    console.log(response);
    if (response.message == "Password set successfully. You can now log in.") {
      router.push("/auth/login");
    }
  };

  useEffect(() => {
    handleInvite();
  }, [token]);

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Set Your Password</CardTitle>
          <CardDescription>
            You're almost there! Just one step left.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-6"
              >
                <FormField
                  control={form.control}
                  name="email"
                  disabled  
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="m@example.com"
                          type="email"
                          {...field}
                          readOnly
                          className="cursor-not-allowed bg-gray-100"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Setting Password..." : "Set Password"}
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
