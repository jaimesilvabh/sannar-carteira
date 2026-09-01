import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";

interface LinhaMapa {
  colaboradorId: string;
  nome: string;
  nivelTecnico: string;
  capacidadeMaximaPontos: number | null;
  pontuacaoTotal: number;
  cargaRelativa: number | null;
  clientesPorNivel: Record<string, number>;
  totalClientes: number;
}
interface MapaResponse {
  niveis: string[];
  linhas: LinhaMapa[];
}

function corCarga(carga: number | null): string {
  if (carga === null) return "bg-slate-100 text-slate-500";
  if (carga > 1) return "bg-red-100 text-red-700";
  if (carga > 0.85) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export function MapaAlocacao() {
  const { nucleoId } = useNucleo();
  const { data } = useQuery({
    queryKey: ["mapa-alocacao", nucleoId],
    queryFn: () => api.get<MapaResponse>(`/alocacoes/mapa?nucleoId=${nucleoId}`),
    enabled: !!nucleoId,
  });

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-slate-800">Mapa Geral de Alocação</h1>
      <p className="mb-4 text-sm text-slate-500">
        Matriz colaborador × nível de cliente. Use a tela de Clientes para avaliar um cliente e receber sugestão automática de alocação.
      </p>

      <div className="card overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
              <th className="pb-2">Colaborador</th>
              <th className="pb-2">Nível técnico</th>
              {data?.niveis.map((n) => (
                <th key={n} className="pb-2 text-center">
                  {n}
                </th>
              ))}
              <th className="pb-2">Total</th>
              <th className="pb-2">Pontuação / Capacidade</th>
              <th className="pb-2">Carga</th>
            </tr>
          </thead>
          <tbody>
            {data?.linhas.map((l) => (
              <tr key={l.colaboradorId} className="border-b border-slate-50">
                <td className="py-2 font-medium">{l.nome}</td>
                <td className="py-2">{l.nivelTecnico}</td>
                {data.niveis.map((n) => (
                  <td key={n} className="py-2 text-center">
                    {l.clientesPorNivel[n] ?? 0}
                  </td>
                ))}
                <td className="py-2">{l.totalClientes}</td>
                <td className="py-2 text-xs text-slate-500">
                  {l.pontuacaoTotal.toFixed(1)} {l.capacidadeMaximaPontos ? `/ ${l.capacidadeMaximaPontos}` : "(sem capacidade definida)"}
                </td>
                <td className="py-2">
                  <span className={`badge ${corCarga(l.cargaRelativa)}`}>{l.cargaRelativa !== null ? `${(l.cargaRelativa * 100).toFixed(0)}%` : "—"}</span>
                </td>
              </tr>
            ))}
            {data?.linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  Nenhum colaborador ativo neste núcleo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
