"use client";

import type React from "react";

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
import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import type { AuthCredentialsLoginWithGoogle } from "@/services/auth/authService";
import { useRouter } from "next/navigation";
import { useAuth } from "@/helpers/AuthContext";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

// Define the form schema with zod
const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Must be a valid email address" }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters" }),
});

// Infer the type from the schema
type LoginFormValues = z.infer<typeof loginFormSchema>;

export function Login({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { login, loginWithGoogleFn } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Initialize the form with react-hook-form and zod validation
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Handle form submissiona
  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);

    try {
      await login({
        email: data.email,
        password: data.password,
      });
    } catch (error) {
      console.error("Login failed:", error);
      setError(
        typeof error === "string"
          ? error
          : "Failed to login. Please check your credentials."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialResponse = async (response: { credential: string }) => {
    setIsLoading(true);
    setError(null);

    try {
      var obj: any = jwtDecode(response.credential);
      console.log("handleCredentialResponse =====>", obj);

      const requestBody: AuthCredentialsLoginWithGoogle = {
        email: obj.email,
      };

      await loginWithGoogleFn(requestBody);
    } catch (error) {
      console.error("Google login failed:", error);
      setError(
        typeof error === "string" ? error : "Failed to login with Google."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadGoogleScript = () => {
      return new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (_e) => reject(new Error("Google script load failed"));
        document.body.appendChild(script);
      });
    };

    const initializeGoogle = async () => {
      try {
        await loadGoogleScript();

        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id:
            "316896747637-pjnbstr5hjoh2t0faul0554l81pjrmq2.apps.googleusercontent.com",
          callback: handleCredentialResponse,
          redirect_uri: "http://localhost:4000/",
          context: "popup",
        });

        document.querySelectorAll("#signInDiv").forEach((element) => {
          google.accounts.id.renderButton(element, {
            theme: "filled",
            size: "large",
            type: "standard",
          });
        });

        google.accounts.id.prompt();
      } catch (error) {
        console.error("Error initializing Google sign-in:", error);
      }
    };

    initializeGoogle();
  }, []);

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Login with your Google account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div className="flex flex-col gap-4">
              <Button variant="outline" className="w-full relative">
                <div id="signInDiv" className="opacity-0 absolute"></div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path
                    d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                    fill="currentColor"
                  />
                </svg>
                Login with Google
              </Button>
            </div>
            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
              <span className="relative z-10 bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>

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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your email"
                          type="email"
                          {...field}
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
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <a
                          href="#"
                          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                        >
                          Forgot your password?
                        </a>
                      </div>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Enter your password"
                            type={showPassword ? "text" : "password"}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showPassword ? (
                              <EyeOff size={18} />
                            ) : (
                              <Eye size={18} />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Logging in..." : "Login"}
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
