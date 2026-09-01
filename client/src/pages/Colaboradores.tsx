import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";
import { Modal } from "../components/Modal";
import { BatchActionBar } from "../components/BatchActionBar";
import { InlineEdit } from "../components/InlineEdit";
import { AtivoToggle } from "../components/AtivoToggle";

interface Colaborador {
  id: string;
  nome: string;
  nivelTecnico: string;
  ativo: boolean;
  remuneracaoTotal: number;
  capacidadeMaximaPontos: number | null;
  dataAdmissao: string | null;
}

const NIVEIS = ["T1", "T2", "T3", "T4"];

export function Colaboradores() {
  const { nucleoId } = useNucleo();
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [novoOpen, setNovoOpen] = useState(false);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["colaboradores", nucleoId, "todos"],
    queryFn: () => api.get<Colaborador[]>(`/colaboradores?nucleoId=${nucleoId}&ativo=todos`),
    enabled: !!nucleoId,
  });

  const atualizar = useMutation({
    mutationFn: (p: { id: string; data: Partial<Colaborador> }) => api.put(`/colaboradores/${p.id}`, p.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["colaboradores", nucleoId] }),
  });

  const toggleAtivoLote = useMutation({
    mutationFn: (ativo: boolean) => api.post("/colaboradores/batch/toggle-active", { ids: selecionados, ativo }),
    onSuccess: () => {
      setSelecionados([]);
      qc.invalidateQueries({ queryKey: ["colaboradores", nucleoId] });
    },
  });

  function toggleTodos(checked: boolean) {
    setSelecionados(checked ? colaboradores.map((c) => c.id) : []);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Colaboradores</h1>
        <button className="btn-primary" onClick={() => setNovoOpen(true)}>
          + Novo colaborador
        </button>
      </div>

      <BatchActionBar count={selecionados.length} onClear={() => setSelecionados([])}>
        <button className="btn-secondary" onClick={() => toggleAtivoLote.mutate(true)}>
          Ativar selecionados
        </button>
        <button className="btn-secondary" onClick={() => toggleAtivoLote.mutate(false)}>
          Desativar selecionados
        </button>
      </BatchActionBar>

      <div className="card overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
              <th className="w-8 pb-2">
                <input type="checkbox" onChange={(e) => toggleTodos(e.target.checked)} checked={selecionados.length === colaboradores.length && colaboradores.length > 0} />
              </th>
              <th className="pb-2">Nome</th>
              <th className="pb-2">Nível técnico</th>
              <th className="pb-2">Capacidade máx. (pts)</th>
              <th className="pb-2">Remuneração total</th>
              <th className="pb-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(c.id)}
                    onChange={(e) => setSelecionados((s) => (e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)))}
                  />
                </td>
                <td className="py-2">
                  <Link to={`/colaboradores/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.nome}
                  </Link>
                </td>
                <td className="py-2">
                  <InlineEdit
                    value={c.nivelTecnico}
                    type="select"
                    options={NIVEIS.map((n) => ({ value: n, label: n }))}
                    onSave={(v) => atualizar.mutate({ id: c.id, data: { nivelTecnico: v } })}
                  />
                </td>
                <td className="py-2">
                  <InlineEdit
                    value={c.capacidadeMaximaPontos ?? ""}
                    type="number"
                    onSave={(v) => atualizar.mutate({ id: c.id, data: { capacidadeMaximaPontos: v ? Number(v) : null } })}
                    display={(v) => (v === "" || v === null ? "—" : String(v))}
                  />
                </td>
                <td className="py-2">
                  <InlineEdit
                    value={c.remuneracaoTotal}
                    type="number"
                    onSave={(v) => atualizar.mutate({ id: c.id, data: { remuneracaoTotal: Number(v) } })}
                    display={(v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  />
                </td>
                <td className="py-2">
                  <AtivoToggle ativo={c.ativo} onChange={(ativo) => atualizar.mutate({ id: c.id, data: { ativo } })} />
                </td>
              </tr>
            ))}
            {colaboradores.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Nenhum colaborador neste núcleo ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NovoColaboradorModal open={novoOpen} onClose={() => setNovoOpen(false)} nucleoId={nucleoId} />
    </div>
  );
}

function NovoColaboradorModal({ open, onClose, nucleoId }: { open: boolean; onClose: () => void; nucleoId: string | null }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [nivelTecnico, setNivelTecnico] = useState("T2");
  const [remuneracaoTotal, setRemuneracaoTotal] = useState("");
  const [capacidadeMaximaPontos, setCapacidadeMaximaPontos] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");

  const criar = useMutation({
    mutationFn: () =>
      api.post("/colaboradores", {
        nome,
        nucleoId,
        nivelTecnico,
        remuneracaoTotal: Number(remuneracaoTotal || 0),
        capacidadeMaximaPontos: capacidadeMaximaPontos ? Number(capacidadeMaximaPontos) : null,
        dataAdmissao: dataAdmissao || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["colaboradores", nucleoId] });
      setNome("");
      setRemuneracaoTotal("");
      setCapacidadeMaximaPontos("");
      setDataAdmissao("");
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Novo colaborador">
      <div className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="label">Nível técnico</label>
          <select className="input" value={nivelTecnico} onChange={(e) => setNivelTecnico(e.target.value)}>
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Data de admissão</label>
          <input className="input" type="date" value={dataAdmissao} onChange={(e) => setDataAdmissao(e.target.value)} />
        </div>
        <div>
          <label className="label">Remuneração total mensal (salário + benefícios + encargos)</label>
          <input className="input" type="number" value={remuneracaoTotal} onChange={(e) => setRemuneracaoTotal(e.target.value)} />
        </div>
        <div>
          <label className="label">Capacidade máxima de pontuação de carteira (opcional)</label>
          <input className="input" type="number" value={capacidadeMaximaPontos} onChange={(e) => setCapacidadeMaximaPontos(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!nome.trim() || criar.isPending} onClick={() => criar.mutate()}>
            Criar
          </button>
        </div>
      </div>
    </Modal>
  );
}
