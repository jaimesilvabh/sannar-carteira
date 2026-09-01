import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, isApiError } from "../auth/AuthContext";

export function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/colaboradores" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (e) {
      setErro(isApiError(e) ? e.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-bold text-brand-700">Sannar Contabilidade</h1>
        <p className="mb-5 text-sm text-slate-500">Carteira e Eficiência — acesso restrito</p>

        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input id="email" className="input mb-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="label" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          className="input mb-4"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

        <button className="btn-primary w-full justify-center" disabled={loading} type="submit">
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
