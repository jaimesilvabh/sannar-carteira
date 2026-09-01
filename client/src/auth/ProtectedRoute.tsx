import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { NucleoProvider } from "../lib/NucleoContext";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <NucleoProvider>
      <Outlet />
    </NucleoProvider>
  );
}

export function DirecaoRoute() {
  const { user } = useAuth();
  if (user?.role !== "DIRECAO") return <Navigate to="/colaboradores" replace />;
  return <Outlet />;
}
