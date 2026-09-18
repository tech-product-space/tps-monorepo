"use client";
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
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { signupWithGoogle } from "@/services/auth/authService";
import { useAuth } from "@/helpers/AuthContext";
import { useRouter } from "next/navigation";

export interface AuthCredentialsSignupWithGoogle {
  name: string;
  email: string;
  phone: string;
  profile_picture: string;
}

export function Signup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { signup } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form Data:", formData);
    handleSignup(formData.name, formData.email, formData.password);
  };

  const handleSignup = async (
    name: string,
    email: string,
    password: string
  ) => {
    const userData = {
      name,
      email,
      password,
    };
    try {
      await signup(userData);
    } catch (error) {
      console.error("Signup failed:", error);
    }
  };

  const handleCredentialResponse = (response: { credential: string }) => {
    var obj: any = jwtDecode(response.credential);
    console.log("handleCredentialResponse =====>", obj);

    const requestBody: AuthCredentialsSignupWithGoogle = {
      name: obj.name,
      email: obj.email,
      phone: "",
      profile_picture: obj.picture,
    };
    signupWithGoogleFn(requestBody);
  };

  const signupWithGoogleFn = async (
    requestBody: AuthCredentialsSignupWithGoogle
  ) => {
    const response = await signupWithGoogle(requestBody);
    // console.log("Google Signup Response:", response);
    if (response.status === 200) {
      router.push("/auth/login");
    } else {
      console.error("Google signup failed:", response);
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
          <CardTitle className="text-xl">Welcome</CardTitle>
          <CardDescription>Signup with your Google account</CardDescription>
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
                Signup with Google
              </Button>
            </div>
            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
              <span className="relative z-10 bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
            <form>
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Full Name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleChange}
                  />
                </div>
                <Button className="w-full" onClick={(e) => handleSubmit(e)}>
                  Sign up
                </Button>
              </div>
            </form>
            <div className="text-center text-sm">
              Have an account already?{" "}
              <a href="/auth/login" className="underline underline-offset-4">
                Log In
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
