"use client";
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import Cookies from "js-cookie";
import {
  login as loginService,
  signup as signupService,
  loginWithGoogle as loginWithGoogleService,
  AuthCredentialsLoginWithGoogle,
  AuthCredentialsSignup,
  AuthCredentialsLogin,
} from "../services/auth/authService";
import { useRouter } from "next/navigation";
import { WORKSPACES, WorkspaceGrant } from "../lib/workspace";

interface User {
  id?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  workspaces?: WorkspaceGrant[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: AuthCredentialsLogin) => Promise<void>;
  signup: (userData: AuthCredentialsSignup) => Promise<void>;
  loginWithGoogleFn: (
    requestBody: AuthCredentialsLoginWithGoogle
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = Cookies.get("admin_token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const storedUser = Cookies.get("user");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Token verification failed:", error);
      logout();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (userData: AuthCredentialsLogin) => {
    setIsLoading(true);
    try {
      // CRM's /api/v1/auth/login is the single unified login now — see
      // authService.login and BACKEND-CONSOLIDATION-PLAN.md §7.2. It returns
      // { user: {..., workspaces}, accessToken, refreshToken }, not the old
      // TPS-specific { message, token, user } shape.
      const response = await loginService(userData);
      Cookies.set("admin_token", response.accessToken, { expires: 7, secure: true });
      if (response.refreshToken) {
        Cookies.set("admin_refreshToken", response.refreshToken, {
          expires: 30,
          secure: true,
        });
      }
      Cookies.set("user", JSON.stringify(response.user), {
        expires: 7,
        secure: true,
      });
      Cookies.set("workspaces", JSON.stringify(response.user.workspaces || []), {
        expires: 7,
        secure: true,
      });
      setUser(response.user);

      const firstGrant: WorkspaceGrant | undefined = response.user.workspaces?.[0];
      router.push(firstGrant ? WORKSPACES[firstGrant.workspace].homePath : "/auth/login");
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogleFn = async (
    requestBody: AuthCredentialsLoginWithGoogle
  ) => {
    setIsLoading(true);
    try {
      // NOT YET UNIFIED — this still hits the TPS backend directly (see the
      // note in authService.ts above loginWithGoogle), so it only ever grants
      // the `tps` workspace. Fine for now since Google login is TPS-only.
      const response = await loginWithGoogleService(requestBody);
      Cookies.set("admin_token", response.token, { expires: 7, secure: true });
      if (response.refreshToken) {
        Cookies.set("admin_refreshToken", response.refreshToken, {
          expires: 30,
          secure: true,
        });
      }
      Cookies.set("user", JSON.stringify(response.user), {
        expires: 7,
        secure: true,
      });
      Cookies.set(
        "workspaces",
        JSON.stringify([{ workspace: "tps", role: response.user.role }]),
        { expires: 7, secure: true }
      );
      setUser(response.user);
      router.push(WORKSPACES.tps.homePath);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (userData: AuthCredentialsSignup) => {
    setIsLoading(true);
    try {
      const response = await signupService(userData);
      if (response.message === "User registered successfully") {
        router.push("/auth/login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    Cookies.remove("admin_token");
    Cookies.remove("admin_refreshToken");
    Cookies.remove("user");
    Cookies.remove("currentRole");
    Cookies.remove("workspaces");
    Cookies.remove("active_workspace");
    setUser(null);
    router.push("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        loginWithGoogleFn,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
