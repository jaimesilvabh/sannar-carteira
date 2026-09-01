import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";
import { NivelBadge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { BatchActionBar } from "../components/BatchActionBar";
import { InlineEdit } from "../components/InlineEdit";
import { AtivoToggle } from "../components/AtivoToggle";

interface Cliente {
  id: string;
  nome: string;
  contato: string | null;
  ativo: boolean;
  nivelOriginalTexto: string | null;
  tipos: { id: string; nome: string }[];
  pontuacao: { pontuacaoTotal: number; nivel: string | null; avaliado: boolean } | null;
}
interface Colaborador {
  id: string;
  nome: string;
}
interface Criterio {
  id: string;
  nome: string;
  peso: number;
  ativo: boolean;
}
interface TipoCliente {
  id: string;
  nome: string;
  ativo: boolean;
}
interface SugestaoResultado {
  nivelCliente: string;
  pontuacaoTotal: number;
  sugestoes: { colaboradorId: string; nome: string; nClientesAtivos: number; cargaRelativa: number }[];
}

export function Clientes() {
  const { nucleoId } = useNucleo();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [clienteAberto, setClienteAberto] = useState<string | null>(null);
  const [reatribuirLote, setReatribuirLote] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", nucleoId, busca, "todos"],
    queryFn: () => api.get<Cliente[]>(`/clientes?nucleoId=${nucleoId}&ativo=todos${busca ? `&q=${encodeURIComponent(busca)}` : ""}`),
    enabled: !!nucleoId,
  });

  const toggleAtivo = useMutation({
    mutationFn: (p: { id: string; ativo: boolean }) => api.put(`/clientes/${p.id}`, { ativo: p.ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes", nucleoId] }),
  });

  const toggleAtivoLote = useMutation({
    mutationFn: (ativo: boolean) => api.post("/clientes/batch/toggle-active", { ids: selecionados, ativo }),
    onSuccess: () => {
      setSelecionados([]);
      qc.invalidateQueries({ queryKey: ["clientes", nucleoId] });
    },
  });

  function toggleTodos(checked: boolean) {
    setSelecionados(checked ? clientes.map((c) => c.id) : []);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800">Clientes</h1>
        <div className="flex gap-2">
          <input className="input !w-64" placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn-primary" onClick={() => setNovoOpen(true)}>
            + Novo cliente
          </button>
        </div>
      </div>

      <BatchActionBar count={selecionados.length} onClear={() => setSelecionados([])}>
        <button className="btn-secondary" onClick={() => setReatribuirLote(true)}>
          Reatribuir colaborador
        </button>
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
                <input type="checkbox" onChange={(e) => toggleTodos(e.target.checked)} checked={selecionados.length === clientes.length && clientes.length > 0} />
              </th>
              <th className="pb-2">Nome</th>
              <th className="pb-2">Tipo</th>
              <th className="pb-2">Nível</th>
              <th className="pb-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(c.id)}
                    onChange={(e) => setSelecionados((s) => (e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)))}
                  />
                </td>
                <td className="py-2">
                  <button className="font-medium text-brand-700 hover:underline" onClick={() => setClienteAberto(c.id)}>
                    {c.nome}
                  </button>
                </td>
                <td className="py-2 text-xs text-slate-500">{c.tipos.map((t) => t.nome).join(", ")}</td>
                <td className="py-2">
                  <NivelBadge nivel={c.pontuacao?.nivel} />
                </td>
                <td className="py-2">
                  <AtivoToggle ativo={c.ativo} onChange={(ativo) => toggleAtivo.mutate({ id: c.id, ativo })} />
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {clienteAberto && <ClienteDetailModal clienteId={clienteAberto} nucleoId={nucleoId!} onClose={() => setClienteAberto(null)} />}
      {novoOpen && <NovoClienteModal onClose={() => setNovoOpen(false)} nucleoId={nucleoId!} />}
      {reatribuirLote && (
        <ReatribuirLoteModal
          nucleoId={nucleoId!}
          ids={selecionados}
          onClose={() => setReatribuirLote(false)}
          onDone={() => {
            setReatribuirLote(false);
            setSelecionados([]);
          }}
        />
      )}
    </div>
  );
}

function ClienteDetailModal({ clienteId, nucleoId, onClose }: { clienteId: string; nucleoId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [sugestao, setSugestao] = useState<SugestaoResultado | null>(null);

  const { data: cliente } = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: () => api.get<any>(`/clientes/${clienteId}`),
  });
  const { data: criterios = [] } = useQuery({
    queryKey: ["criterios", nucleoId],
    queryFn: () => api.get<Criterio[]>(`/criterios?nucleoId=${nucleoId}`),
  });
  const { data: tiposDisponiveis = [] } = useQuery({
    queryKey: ["tipos-cliente", nucleoId],
    queryFn: () => api.get<TipoCliente[]>(`/tipos-cliente?nucleoId=${nucleoId}`),
  });
  const { data: colaboradores = [] } = useQuery({
    queryKey: ["colaboradores", nucleoId],
    queryFn: () => api.get<Colaborador[]>(`/colaboradores?nucleoId=${nucleoId}`),
  });

  const atualizarCliente = useMutation({
    mutationFn: (data: Record<string, string>) => api.put(`/clientes/${clienteId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["clientes", nucleoId] });
    },
  });

  const salvarTipos = useMutation({
    mutationFn: (tipoIds: string[]) => api.post(`/clientes/${clienteId}/tipos`, { nucleoId, tipoIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["clientes", nucleoId] });
    },
  });

  const pontuar = useMutation({
    mutationFn: (p: { criterioId: string; valor: number }) => api.post(`/clientes/${clienteId}/pontuacoes`, { nucleoId, ...p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["clientes", nucleoId] });
    },
  });

  const buscarSugestao = useMutation({
    mutationFn: () => api.post<SugestaoResultado>("/alocacoes/sugestao", { clienteId, nucleoId }),
    onSuccess: setSugestao,
  });

  const alocar = useMutation({
    mutationFn: (colaboradorId: string) => api.post("/alocacoes", { clienteId, colaboradorId, nucleoId, origem: "SUGESTAO" }),
    onSuccess: () => {
      setSugestao(null);
      qc.invalidateQueries({ queryKey: ["alocacoes"] });
    },
  });

  const pontuacaoAtual: { detalhePorCriterio?: { criterioId: string; valor: number | null }[] } | undefined = cliente?.pontuacoesPorNucleo?.[nucleoId];
  const tiposAtuais: { id: string; nome: string }[] = cliente?.tiposPorNucleo?.[nucleoId] ?? [];
  const tipoIdsAtuais = new Set(tiposAtuais.map((t) => t.id));

  function alternarTipo(tipoId: string) {
    const novos = tipoIdsAtuais.has(tipoId) ? [...tipoIdsAtuais].filter((id) => id !== tipoId) : [...tipoIdsAtuais, tipoId];
    salvarTipos.mutate(novos);
  }

  return (
    <Modal open onClose={onClose} title={cliente?.nome ?? "Cliente"} wide>
      {!cliente ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="label mb-0">Nome</span>
              <InlineEdit value={cliente.nome} onSave={(v) => atualizarCliente.mutate({ nome: v })} />
            </div>
            <div>
              <span className="label mb-0">Contato</span>
              <InlineEdit value={cliente.contato ?? ""} onSave={(v) => atualizarCliente.mutate({ contato: v })} />
            </div>
          </div>

          {cliente.nivelOriginalTexto && (
            <p className="text-xs text-slate-400">Nível original da planilha (referência): {cliente.nivelOriginalTexto}</p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Tipo de cliente</h3>
            <div className="flex flex-wrap gap-2">
              {tiposDisponiveis.map((t) => (
                <button
                  key={t.id}
                  className={`badge cursor-pointer ${tipoIdsAtuais.has(t.id) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}
                  onClick={() => alternarTipo(t.id)}
                  disabled={salvarTipos.isPending}
                >
                  {t.nome}
                </button>
              ))}
              {tiposDisponiveis.length === 0 && (
                <p className="text-xs text-slate-400">Nenhum tipo cadastrado — crie em Configuração → Tipos de Cliente.</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Avaliação por critério (1 a 5)</h3>
            <div className="space-y-2">
              {criterios.map((crit) => {
                const valorAtual = pontuacaoAtual?.detalhePorCriterio?.find((d) => d.criterioId === crit.id)?.valor ?? null;
                return (
                  <div key={crit.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">{crit.nome}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          className={`h-7 w-7 rounded text-xs font-semibold ${
                            valorAtual === v ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                          onClick={() => pontuar.mutate({ criterioId: crit.id, valor: v })}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Alocação</h3>
            <button className="btn-secondary" disabled={buscarSugestao.isPending} onClick={() => buscarSugestao.mutate()}>
              Sugerir colaborador
            </button>
            {sugestao && (
              <div className="mt-3 space-y-1 text-sm">
                <p className="text-xs text-slate-500">
                  Nível calculado: <NivelBadge nivel={sugestao.nivelCliente} /> ({sugestao.pontuacaoTotal.toFixed(1)} pts)
                </p>
                {sugestao.sugestoes.map((s) => (
                  <div key={s.colaboradorId} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5">
                    <span>
                      {s.nome} <span className="text-xs text-slate-400">({s.nClientesAtivos} clientes, carga {(s.cargaRelativa * 100).toFixed(0)}%)</span>
                    </span>
                    <button className="btn-primary !px-2 !py-1 !text-xs" onClick={() => alocar.mutate(s.colaboradorId)}>
                      Alocar
                    </button>
                  </div>
                ))}
                {sugestao.sugestoes.length === 0 && <p className="text-slate-400">Nenhum colaborador apto encontrado.</p>}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-slate-500">Alocação manual:</span>
              <select className="input !w-auto" id={`manual-${clienteId}`} defaultValue="">
                <option value="" disabled>
                  Selecione...
                </option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <button
                className="btn-secondary"
                onClick={() => {
                  const el = document.getElementById(`manual-${clienteId}`) as HTMLSelectElement;
                  if (el.value) alocar.mutate(el.value);
                }}
              >
                Alocar manualmente
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NovoClienteModal({ onClose, nucleoId }: { onClose: () => void; nucleoId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");

  const criar = useMutation({
    mutationFn: () => api.post("/clientes", { nome, contato, nucleoIds: [nucleoId] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes", nucleoId] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title="Novo cliente">
      <div className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="label">Contato</label>
          <input className="input" value={contato} onChange={(e) => setContato(e.target.value)} />
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

function ReatribuirLoteModal({ nucleoId, ids, onClose, onDone }: { nucleoId: string; ids: string[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [colaboradorId, setColaboradorId] = useState("");
  const { data: colaboradores = [] } = useQuery({
    queryKey: ["colaboradores", nucleoId],
    queryFn: () => api.get<Colaborador[]>(`/colaboradores?nucleoId=${nucleoId}`),
  });

  const reatribuir = useMutation({
    mutationFn: () => api.post("/clientes/batch/reassign", { ids, colaboradorId, nucleoId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes", nucleoId] });
      onDone();
    },
  });

  return (
    <Modal open onClose={onClose} title={`Reatribuir ${ids.length} cliente(s)`}>
      <div className="space-y-3">
        <div>
          <label className="label">Novo colaborador responsável</label>
          <select className="input" value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}>
            <option value="" disabled>
              Selecione...
            </option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!colaboradorId || reatribuir.isPending} onClick={() => reatribuir.mutate()}>
            Reatribuir
          </button>
        </div>
      </div>
    </Modal>
  );
}
