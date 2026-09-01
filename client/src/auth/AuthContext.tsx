import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: "DIRECAO" | "LIDER_NUCLEO";
  nucleoId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const u = await api.post<AuthUser>("/auth/login", { email, password });
    setUser(u);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
