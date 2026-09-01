import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";

interface RelatorioImportacao {
  abasProcessadas: string[];
  abasIgnoradas: string[];
  clientesCriados: number;
  clientesAtualizados: number;
  colaboradoresCriados: number;
  volumesGravados: number;
  alocacoesCriadas: number;
  avisos: string[];
}

export function ImportExport() {
  const { nucleos } = useNucleo();
  const nucleoPessoal = nucleos.find((n) => n.nome === "Pessoal");
  const inputRef = useRef<HTMLInputElement>(null);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [erro, setErro] = useState<string | null>(null);

  const importar = useMutation({
    mutationFn: (arquivo: File) => {
      const form = new FormData();
      form.append("arquivo", arquivo);
      return api.post<RelatorioImportacao>("/import/pessoal", form);
    },
    onError: (e) => setErro(e instanceof ApiError ? e.message : "Erro ao importar"),
    onSuccess: () => setErro(null),
  });

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-slate-800">Importar / Exportar (Núcleo Pessoal)</h1>
      <p className="mb-4 text-sm text-slate-500">
        Importa o formato real da planilha (uma aba por colaborador + blocos mensais de Empregados/Sócios/Autônomos/Estagiários, aba DOMESTICAS).
      </p>

      <div className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Importar planilha (.xlsx)</h2>
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept=".xlsx" className="text-sm" />
          <button
            className="btn-primary"
            disabled={importar.isPending}
            onClick={() => {
              const arquivo = inputRef.current?.files?.[0];
              if (arquivo) importar.mutate(arquivo);
            }}
          >
            {importar.isPending ? "Importando..." : "Importar"}
          </button>
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </div>

      {importar.data && (
        <div className="card mb-4 space-y-3 p-4">
          <h2 className="text-sm font-semibold text-slate-700">Relatório da importação</h2>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <ResumoItem label="Abas processadas" value={importar.data.abasProcessadas.length} />
            <ResumoItem label="Abas ignoradas" value={importar.data.abasIgnoradas.length} />
            <ResumoItem label="Clientes criados" value={importar.data.clientesCriados} />
            <ResumoItem label="Clientes atualizados" value={importar.data.clientesAtualizados} />
            <ResumoItem label="Colaboradores criados" value={importar.data.colaboradoresCriados} />
            <ResumoItem label="Volumes mensais gravados" value={importar.data.volumesGravados} />
            <ResumoItem label="Alocações criadas" value={importar.data.alocacoesCriadas} />
          </div>
          {importar.data.avisos.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-amber-700">{importar.data.avisos.length} aviso(s):</p>
              <div className="max-h-48 overflow-y-auto rounded bg-amber-50 p-2 text-xs text-amber-800">
                {importar.data.avisos.map((a, i) => (
                  <p key={i}>• {a}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Exportar planilha</h2>
        <div className="flex items-center gap-2">
          <select className="input !w-auto" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {[ano - 1, ano, ano + 1].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <a className="btn-secondary" href={`/api/export/pessoal.xlsx?ano=${ano}`}>
            Exportar .xlsx
          </a>
        </div>
        {!nucleoPessoal && <p className="mt-2 text-xs text-slate-400">Núcleo Pessoal não disponível para seu usuário.</p>}
      </div>
    </div>
  );
}

function ResumoItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-100 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-bold text-slate-800">{value}</p>
    </div>
  );
}
