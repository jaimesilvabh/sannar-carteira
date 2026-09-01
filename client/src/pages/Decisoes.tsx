import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";
import { SeveridadeBadge } from "../components/Badge";

interface Alerta {
  tipo: string;
  severidade: "ALTA" | "MEDIA" | "BAIXA";
  titulo: string;
  nucleoId: string;
  colaboradorId?: string;
  clienteId?: string;
  dadosBrutos: Record<string, unknown>;
}

const TITULOS_TIPO: Record<string, string> = {
  SOBRECARGA: "Sobrecarga de carteira",
  EFICIENCIA_EM_QUEDA: "Eficiência em queda",
  NECESSIDADE_CONTRATACAO: "Necessidade de contratação",
  OPORTUNIDADE_REDISTRIBUICAO: "Oportunidade de redistribuição",
  ALOCACAO_INCOMPATIVEL: "Alocação incompatível",
  CUSTO_POR_PONTO_ALTO: "Custo por ponto acima da média",
};

export function Decisoes() {
  const { nucleoId } = useNucleo();
  const qc = useQueryClient();
  const [expandido, setExpandido] = useState<number | null>(null);
  const agora = new Date();

  const { data: alertas = [], isLoading } = useQuery({
    queryKey: ["decisoes", nucleoId],
    queryFn: () => api.get<Alerta[]>(`/decisoes?nucleoId=${nucleoId}`),
    enabled: !!nucleoId,
  });

  const recalcular = useMutation({
    mutationFn: () => api.post("/snapshots/recalcular", { nucleoId, mes: agora.getMonth() + 1, ano: agora.getFullYear() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decisoes", nucleoId] }),
  });

  const agrupado = new Map<string, Alerta[]>();
  for (const a of alertas) {
    agrupado.set(a.tipo, [...(agrupado.get(a.tipo) ?? []), a]);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Painel de Decisões</h1>
          <p className="text-sm text-slate-500">Sinalizações estratégicas com o dado bruto que sustenta cada alerta.</p>
        </div>
        <button className="btn-secondary" disabled={recalcular.isPending} onClick={() => recalcular.mutate()}>
          {recalcular.isPending ? "Recalculando..." : "Recalcular indicadores do mês"}
        </button>
      </div>

      {isLoading && <p className="text-slate-500">Carregando...</p>}
      {!isLoading && alertas.length === 0 && (
        <div className="card p-6 text-center text-slate-400">
          Nenhuma sinalização no momento. Clique em "Recalcular indicadores do mês" após lançar eficiência/capacidade para atualizar os alertas de sobrecarga e contratação.
        </div>
      )}

      <div className="space-y-4">
        {[...agrupado.entries()].map(([tipo, itens]) => (
          <div key={tipo} className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              {TITULOS_TIPO[tipo] ?? tipo} <span className="text-xs font-normal text-slate-400">({itens.length})</span>
            </h2>
            <div className="space-y-2">
              {itens.map((a, i) => {
                const key = tipo.length * 1000 + i;
                return (
                  <div key={i} className="rounded border border-slate-100">
                    <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm" onClick={() => setExpandido(expandido === key ? null : key)}>
                      <span className="flex items-center gap-2">
                        <SeveridadeBadge severidade={a.severidade} /> {a.titulo}
                      </span>
                      <span className="text-slate-400">{expandido === key ? "▲" : "▼"}</span>
                    </button>
                    {expandido === key && (
                      <pre className="overflow-x-auto border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {JSON.stringify(a.dadosBrutos, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
