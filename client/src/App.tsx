import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute, DirecaoRoute } from "./auth/ProtectedRoute";
import { Login } from "./pages/Login";
import { Config } from "./pages/Config";
import { Colaboradores } from "./pages/Colaboradores";
import { ColaboradorDetail } from "./pages/ColaboradorDetail";
import { Clientes } from "./pages/Clientes";
import { MapaAlocacao } from "./pages/MapaAlocacao";
import { Eficiencia } from "./pages/Eficiencia";
import { Decisoes } from "./pages/Decisoes";
import { ImportExport } from "./pages/ImportExport";
import { Relatorios } from "./pages/Relatorios";
import { Usuarios } from "./pages/Usuarios";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/colaboradores" replace />} />
          <Route path="/colaboradores" element={<Colaboradores />} />
          <Route path="/colaboradores/:id" element={<ColaboradorDetail />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/alocacao" element={<MapaAlocacao />} />
          <Route path="/eficiencia" element={<Eficiencia />} />
          <Route path="/decisoes" element={<Decisoes />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/config" element={<Config />} />
          <Route path="/import" element={<ImportExport />} />
          <Route element={<DirecaoRoute />}>
            <Route path="/usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
