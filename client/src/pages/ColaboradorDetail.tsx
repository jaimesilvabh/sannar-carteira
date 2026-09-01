import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api/client";
import { HeatmapGrid } from "../components/Heatmap";
import { NivelBadge } from "../components/Badge";
import { InlineEdit } from "../components/InlineEdit";

interface DashboardColaborador {
  colaborador: {
    id: string;
    nome: string;
    nivelTecnico: string;
    remuneracaoTotal: number;
    capacidadeMaximaPontos: number | null;
  };
  totalClientes: number;
  naoAvaliados: number;
  clientesPorNivel: Record<string, number>;
  percentualSobreNucleo: number;
  percentualSobreEmpresa: number;
  pontuacaoTotal: number;
  capacidadeMaximaPontos: number | null;
  cargaRelativa: number | null;
  custoPorPonto: number | null;
  raioXPorCriterio: { criterioId: string; nome: string; distribuicao: Record<number, number> }[];
  heatmapEficiencia: { mes: number; eficiencia: number | null }[];
  produtividadeMedia: number | null;
  carteiraAnalitica: { clienteId: string; nome: string; contato: string | null; tipos: string[]; nivel: string | null; pontuacaoTotal: number; desde: string }[];
  ano: number;
}

interface TimesheetRegistro {
  id: string;
  mes: number;
  ano: number;
  eficiencia: number;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function ColaboradorDetail() {
  const { id } = useParams<{ id: string }>();
  const [ano, setAno] = useState(new Date().getFullYear());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-colaborador", id, ano],
    queryFn: () => api.get<DashboardColaborador>(`/dashboard-colaborador/${id}?ano=${ano}`),
    enabled: !!id,
  });

  const { data: timesheets = [] } = useQuery({
    queryKey: ["timesheets", id, ano],
    queryFn: () => api.get<TimesheetRegistro[]>(`/timesheets?colaboradorId=${id}&ano=${ano}`),
    enabled: !!id,
  });

  const salvarTimesheet = useMutation({
    mutationFn: (p: { mes: number; eficiencia: string }) =>
      api.post("/timesheets", { colaboradorId: id, mes: p.mes, ano, eficiencia: Number(p.eficiencia) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets", id, ano] });
      qc.invalidateQueries({ queryKey: ["dashboard-colaborador", id, ano] });
    },
  });

  if (isLoading || !data) return <div className="text-slate-500">Carregando...</div>;

  const dadosGrafico = Object.entries(data.clientesPorNivel).map(([nivel, qtd]) => ({ nivel, qtd }));

  return (
    <div>
      <Link to="/colaboradores" className="text-sm text-brand-700 hover:underline">
        ← Colaboradores
      </Link>
      <div className="mb-4 mt-1 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">
          {data.colaborador.nome} <span className="text-sm font-normal text-slate-400">({data.colaborador.nivelTecnico})</span>
        </h1>
        <div className="flex items-center gap-2">
          <select className="input !w-auto" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {[ano - 1, ano, ano + 1].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <a className="btn-secondary" href={`/api/relatorios/colaborador/${id}/pdf?ano=${ano}`}>
            Baixar relatório PDF
          </a>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total de clientes" value={String(data.totalClientes)} sub={`${data.naoAvaliados} não avaliados`} />
        <Kpi label="% da carteira do núcleo" value={`${(data.percentualSobreNucleo * 100).toFixed(1)}%`} />
        <Kpi label="% da carteira da empresa" value={`${(data.percentualSobreEmpresa * 100).toFixed(1)}%`} />
        <Kpi
          label="Pontuação vs capacidade"
          value={data.capacidadeMaximaPontos ? `${data.pontuacaoTotal.toFixed(0)} / ${data.capacidadeMaximaPontos}` : data.pontuacaoTotal.toFixed(0)}
          sub={data.cargaRelativa !== null ? `${(data.cargaRelativa * 100).toFixed(0)}% da capacidade` : "capacidade não definida"}
          alerta={data.cargaRelativa !== null && data.cargaRelativa > 1}
        />
        <Kpi
          label="Custo por ponto de carteira"
          value={data.custoPorPonto !== null ? data.custoPorPonto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
        />
        <Kpi label="Produtividade média no ano" value={data.produtividadeMedia !== null ? `${data.produtividadeMedia.toFixed(1)}%` : "sem lançamentos"} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Clientes por nível</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nivel" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="qtd" fill="#2f6bff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-3 text-sm">
            {Object.entries(data.clientesPorNivel).map(([nivel, qtd]) => (
              <div key={nivel} className="flex items-center gap-1">
                <NivelBadge nivel={nivel} /> <span className="text-slate-500">{qtd}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Raio-X por critério (nº de clientes por pontuação)</h2>
          <div className="max-h-56 space-y-2 overflow-y-auto text-xs">
            {data.raioXPorCriterio.map((c) => (
              <div key={c.criterioId}>
                <p className="mb-1 font-medium text-slate-600">{c.nome}</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <div key={v} className="flex-1 rounded bg-slate-100 px-1 py-0.5 text-center">
                      <div className="text-slate-400">{v}</div>
                      <div className="font-semibold text-slate-700">{c.distribuicao[v] ?? 0}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Relação analítica da carteira ({data.carteiraAnalitica.length})</h2>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 border-b border-slate-100 bg-white text-left font-medium text-slate-500">
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Contato</th>
                <th className="pb-2">Tipo</th>
                <th className="pb-2">Nível</th>
                <th className="pb-2">Pontuação</th>
              </tr>
            </thead>
            <tbody>
              {data.carteiraAnalitica.map((c) => (
                <tr key={c.clienteId} className="border-b border-slate-50">
                  <td className="py-1.5 pr-2 font-medium text-slate-700">{c.nome}</td>
                  <td className="py-1.5 pr-2 text-slate-500">{c.contato ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-slate-500">{c.tipos.join(", ") || "—"}</td>
                  <td className="py-1.5 pr-2">
                    <NivelBadge nivel={c.nivel} />
                  </td>
                  <td className="py-1.5">{c.pontuacaoTotal.toFixed(1)}</td>
                </tr>
              ))}
              {data.carteiraAnalitica.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    Nenhum cliente alocado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Eficiência mensal ({ano})</h2>
        <HeatmapGrid linhas={[{ label: data.colaborador.nome, heatmap: data.heatmapEficiencia }]} />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Lançamento mensal de eficiência (%)</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {MESES.map((label, i) => {
            const mes = i + 1;
            const registro = timesheets.find((t) => t.mes === mes);
            return (
              <div key={mes} className="rounded border border-slate-100 p-2">
                <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
                <InlineEdit
                  value={registro?.eficiencia ?? ""}
                  type="number"
                  onSave={(v) => salvarTimesheet.mutate({ mes, eficiencia: v })}
                  display={(v) => (v === "" ? <span className="text-slate-300">—</span> : `${v}%`)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, alerta }: { label: string; value: string; sub?: string; alerta?: boolean }) {
  return (
    <div className={`card p-3 ${alerta ? "border-red-300 bg-red-50" : ""}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${alerta ? "text-red-700" : "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
