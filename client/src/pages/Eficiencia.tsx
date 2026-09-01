import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";
import { useAuth } from "../auth/AuthContext";
import { HeatmapGrid } from "../components/Heatmap";

type Aba = "colaboradores" | "nucleos" | "empresa";

interface LinhaHeatmap {
  colaboradorId?: string;
  nucleoId?: string;
  nome: string;
  heatmap: { mes: number; eficiencia: number | null }[];
}

export function Eficiencia() {
  const { nucleoId } = useNucleo();
  const { user } = useAuth();
  const [aba, setAba] = useState<Aba>("colaboradores");
  const [ano, setAno] = useState(new Date().getFullYear());

  const { data: porColaborador = [] } = useQuery({
    queryKey: ["eficiencia-colaboradores", nucleoId, ano],
    queryFn: () => api.get<LinhaHeatmap[]>(`/eficiencia/colaboradores?nucleoId=${nucleoId}&ano=${ano}`),
    enabled: !!nucleoId && aba === "colaboradores",
  });
  const { data: porNucleo = [] } = useQuery({
    queryKey: ["eficiencia-nucleos", ano],
    queryFn: () => api.get<LinhaHeatmap[]>(`/eficiencia/nucleos?ano=${ano}`),
    enabled: aba === "nucleos",
  });
  const { data: empresa } = useQuery({
    queryKey: ["eficiencia-empresa", ano],
    queryFn: () => api.get<{ heatmap: { mes: number; eficiencia: number | null }[] }>(`/eficiencia/empresa?ano=${ano}`),
    enabled: aba === "empresa" && user?.role === "DIRECAO",
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Mapa Geral de Eficiência</h1>
        <select className="input !w-auto" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {[ano - 1, ano, ano + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200 text-sm">
        {[
          ["colaboradores", "Por colaborador"],
          ["nucleos", "Por núcleo"],
          ["empresa", "Empresa (consolidado)"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k as Aba)}
            disabled={k === "empresa" && user?.role !== "DIRECAO"}
            className={`px-3 py-2 font-medium disabled:opacity-30 ${aba === k ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card p-4">
        {aba === "colaboradores" && <HeatmapGrid linhas={porColaborador.map((l) => ({ label: l.nome, heatmap: l.heatmap }))} />}
        {aba === "nucleos" && <HeatmapGrid linhas={porNucleo.map((l) => ({ label: l.nome, heatmap: l.heatmap }))} />}
        {aba === "empresa" && empresa && <HeatmapGrid linhas={[{ label: "Sannar Contabilidade", heatmap: empresa.heatmap }]} />}
      </div>
    </div>
  );
}
