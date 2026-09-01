import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";

interface ClientesPorTipo {
  nucleo: { nome: string };
  grupos: { tipo: string; quantidade: number; clientes: string[] }[];
  semTipo: number;
}

export function Relatorios() {
  const { nucleoId } = useNucleo();
  const [ano] = useState(new Date().getFullYear());
  const [tipoAberto, setTipoAberto] = useState<string | null>(null);

  const { data: clientesPorTipo } = useQuery({
    queryKey: ["relatorio-clientes-por-tipo", nucleoId],
    queryFn: () => api.get<ClientesPorTipo>(`/relatorios/nucleo/${nucleoId}/clientes-por-tipo`),
    enabled: !!nucleoId,
  });

  if (!nucleoId) return null;

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-slate-800">Relatórios</h1>
      <p className="mb-4 text-sm text-slate-500">Relatórios consolidados do núcleo, prontos para baixar em PDF.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Desempenho geral da carteira</h2>
          <p className="mb-3 text-xs text-slate-500">Clientes, pontuação, capacidade e eficiência média por colaborador — ano {ano}.</p>
          <a className="btn-primary" href={`/api/relatorios/nucleo/${nucleoId}/desempenho/pdf?ano=${ano}`}>
            Baixar PDF
          </a>
        </div>

        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Custo consolidado por colaborador</h2>
          <p className="mb-3 text-xs text-slate-500">Remuneração, pontuação de carteira e custo por ponto, lado a lado.</p>
          <a className="btn-primary" href={`/api/relatorios/nucleo/${nucleoId}/custos/pdf`}>
            Baixar PDF
          </a>
        </div>

        <div className="card p-4 md:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Clientes por tipo</h2>
          <p className="mb-3 text-xs text-slate-500">Quantidade de clientes por tipo configurado, com a lista completa de cada grupo.</p>
          <a className="btn-primary" href={`/api/relatorios/nucleo/${nucleoId}/clientes-por-tipo/pdf`}>
            Baixar PDF
          </a>
        </div>
      </div>

      {clientesPorTipo && (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Resumo — Clientes por tipo ({clientesPorTipo.nucleo.nome})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="pb-2">Tipo</th>
                <th className="pb-2">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {clientesPorTipo.grupos.map((g) => (
                <Fragment key={g.tipo}>
                  <tr className="border-b border-slate-50">
                    <td className="py-2">
                      <button className="font-medium text-brand-700 hover:underline" onClick={() => setTipoAberto(tipoAberto === g.tipo ? null : g.tipo)}>
                        {g.tipo}
                      </button>
                    </td>
                    <td className="py-2">{g.quantidade}</td>
                  </tr>
                  {tipoAberto === g.tipo && (
                    <tr className="border-b border-slate-50 bg-slate-50">
                      <td colSpan={2} className="max-h-48 overflow-y-auto px-3 py-2 text-xs text-slate-600">
                        {g.clientes.join(", ")}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr>
                <td className="py-2 text-slate-500">Sem tipo definido</td>
                <td className="py-2 text-slate-500">{clientesPorTipo.semTipo}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
