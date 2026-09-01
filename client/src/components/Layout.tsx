import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useNucleo } from "../lib/NucleoContext";

const LINKS = [
  { to: "/colaboradores", label: "Colaboradores" },
  { to: "/clientes", label: "Clientes" },
  { to: "/alocacao", label: "Alocação" },
  { to: "/eficiencia", label: "Eficiência" },
  { to: "/decisoes", label: "Decisões" },
  { to: "/relatorios", label: "Relatórios" },
  { to: "/config", label: "Configuração" },
  { to: "/import", label: "Importar/Exportar" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { nucleos, nucleoId, setNucleoId, podeAlternar } = useNucleo();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <span className="text-sm font-bold text-brand-700">Sannar · Carteira</span>

          <nav className="flex flex-1 items-center gap-1 text-sm">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {user?.role === "DIRECAO" && (
              <NavLink
                to="/usuarios"
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                Usuários
              </NavLink>
            )}
          </nav>

          {podeAlternar ? (
            <select className="input !w-auto" value={nucleoId ?? ""} onChange={(e) => setNucleoId(e.target.value)}>
              {nucleos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="badge bg-slate-100 text-slate-600">{nucleos.find((n) => n.id === nucleoId)?.nome ?? "..."}</span>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>{user?.nome}</span>
            <button className="btn-ghost" onClick={() => logout()}>
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
