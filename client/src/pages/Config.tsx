import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";
import { InlineEdit } from "../components/InlineEdit";
import { AtivoToggle } from "../components/AtivoToggle";

interface Criterio {
  id: string;
  nome: string;
  descricao: string | null;
  peso: number;
  ativo: boolean;
}
interface FaixaCliente {
  id: string;
  nivel: string;
  pontuacaoMin: number;
  pontuacaoMax: number;
}
interface FaixaColaborador {
  id: string;
  nivel: string;
  descricaoCompetencias: string | null;
}
interface Regra {
  id: string;
  nivelTecnico: string;
  nivelClienteMaximo: string;
}
interface TipoCliente {
  id: string;
  nome: string;
  ativo: boolean;
}

const ABAS = ["criterios", "faixas", "niveis", "regras", "tipos"] as const;
const NIVEIS_CLIENTE = ["N1", "N2", "N3", "N4"];

export function Config() {
  const { nucleoId } = useNucleo();
  const [aba, setAba] = useState<(typeof ABAS)[number]>("criterios");

  if (!nucleoId) return null;

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-800">Configuração</h1>
      <div className="mb-4 flex gap-1 border-b border-slate-200 text-sm">
        {[
          ["criterios", "Critérios do Cliente"],
          ["faixas", "Faixas de Nível (Cliente)"],
          ["niveis", "Níveis Técnicos (Colaborador)"],
          ["regras", "Correspondência Nível↔Nível"],
          ["tipos", "Tipos de Cliente"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k as (typeof ABAS)[number])}
            className={`px-3 py-2 font-medium ${aba === k ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "criterios" && <AbaCriterios nucleoId={nucleoId} />}
      {aba === "faixas" && <AbaFaixasCliente nucleoId={nucleoId} />}
      {aba === "niveis" && <AbaNiveisTecnicos nucleoId={nucleoId} />}
      {aba === "regras" && <AbaRegras nucleoId={nucleoId} />}
      {aba === "tipos" && <AbaTiposCliente nucleoId={nucleoId} />}
    </div>
  );
}

function AbaCriterios({ nucleoId }: { nucleoId: string }) {
  const qc = useQueryClient();
  const { data: criterios = [] } = useQuery({
    queryKey: ["criterios", nucleoId],
    queryFn: () => api.get<Criterio[]>(`/criterios?nucleoId=${nucleoId}`),
  });
  const [novoNome, setNovoNome] = useState("");

  const criar = useMutation({
    mutationFn: () => api.post("/criterios", { nucleoId, nome: novoNome, peso: 1 }),
    onSuccess: () => {
      setNovoNome("");
      qc.invalidateQueries({ queryKey: ["criterios", nucleoId] });
    },
  });
  const atualizar = useMutation({
    mutationFn: (p: { id: string; data: Partial<Criterio> }) => api.put(`/criterios/${p.id}`, p.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["criterios", nucleoId] }),
  });

  return (
    <div className="card p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="pb-2">Critério</th>
            <th className="pb-2 w-40">Peso</th>
            <th className="pb-2 w-24">Status</th>
          </tr>
        </thead>
        <tbody>
          {criterios.map((c) => (
            <tr key={c.id} className="border-b border-slate-50">
              <td className="py-2 pr-2">
                <InlineEdit value={c.nome} onSave={(v) => atualizar.mutate({ id: c.id, data: { nome: v } })} />
              </td>
              <td className="py-2 pr-2">
                <InlineEdit value={c.peso} type="number" step="0.1" onSave={(v) => atualizar.mutate({ id: c.id, data: { peso: Number(v) } })} />
              </td>
              <td className="py-2">
                <AtivoToggle ativo={c.ativo} onChange={(ativo) => atualizar.mutate({ id: c.id, data: { ativo } })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex gap-2">
        <input className="input" placeholder="Novo critério..." value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!novoNome.trim()} onClick={() => criar.mutate()}>
          Adicionar
        </button>
      </div>
    </div>
  );
}

function AbaFaixasCliente({ nucleoId }: { nucleoId: string }) {
  const qc = useQueryClient();
  const { data: faixas = [] } = useQuery({
    queryKey: ["faixas-cliente", nucleoId],
    queryFn: () => api.get<FaixaCliente[]>(`/faixas-cliente?nucleoId=${nucleoId}`),
  });
  const atualizar = useMutation({
    mutationFn: (p: { id: string; data: Partial<FaixaCliente> }) => api.put(`/faixas-cliente/${p.id}`, p.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faixas-cliente", nucleoId] }),
  });
  const recalibrar = useMutation({
    mutationFn: () => api.post<{ somaPesos: number }>("/faixas-cliente/recalibrar", { nucleoId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faixas-cliente", nucleoId] }),
  });

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500">
          Nível do cliente = soma (pontuação × peso) dos critérios avaliados. Se você mudar os pesos dos critérios, as
          faixas abaixo podem ficar descalibradas — clique em "Recalcular automaticamente" para redividir a escala com
          base na nota média por critério (N1 = média &lt;2, N2 = 2–3, N3 = 3–4, N4 = 4–5), em vez de editar os limites
          um a um.
        </p>
        <button className="btn-secondary shrink-0" disabled={recalibrar.isPending} onClick={() => recalibrar.mutate()}>
          {recalibrar.isPending ? "Recalculando..." : "Recalcular automaticamente"}
        </button>
      </div>
      {recalibrar.data && (
        <p className="mb-3 text-xs text-emerald-700">
          Faixas recalculadas com base na soma de pesos ativos = {recalibrar.data.somaPesos}.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="pb-2 w-20">Nível</th>
            <th className="pb-2">Pontuação mínima</th>
            <th className="pb-2">Pontuação máxima</th>
          </tr>
        </thead>
        <tbody>
          {faixas.map((f) => (
            <tr key={f.id} className="border-b border-slate-50">
              <td className="py-2 font-semibold">{f.nivel}</td>
              <td className="py-2 pr-2">
                <InlineEdit value={f.pontuacaoMin} type="number" onSave={(v) => atualizar.mutate({ id: f.id, data: { pontuacaoMin: Number(v) } })} />
              </td>
              <td className="py-2 pr-2">
                <InlineEdit value={f.pontuacaoMax} type="number" onSave={(v) => atualizar.mutate({ id: f.id, data: { pontuacaoMax: Number(v) } })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbaNiveisTecnicos({ nucleoId }: { nucleoId: string }) {
  const qc = useQueryClient();
  const { data: niveis = [] } = useQuery({
    queryKey: ["faixas-colaborador", nucleoId],
    queryFn: () => api.get<FaixaColaborador[]>(`/faixas-colaborador?nucleoId=${nucleoId}`),
  });
  const atualizar = useMutation({
    mutationFn: (p: { id: string; descricaoCompetencias: string }) => api.put(`/faixas-colaborador/${p.id}`, { descricaoCompetencias: p.descricaoCompetencias }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faixas-colaborador", nucleoId] }),
  });

  return (
    <div className="card space-y-3 p-4">
      {niveis.map((n) => (
        <div key={n.id}>
          <label className="label">{n.nivel}</label>
          <InlineEdit
            value={n.descricaoCompetencias ?? ""}
            type="textarea"
            onSave={(v) => atualizar.mutate({ id: n.id, descricaoCompetencias: v })}
            display={(v) => <span className="whitespace-pre-line">{v || "—"}</span>}
          />
        </div>
      ))}
    </div>
  );
}

function AbaRegras({ nucleoId }: { nucleoId: string }) {
  const qc = useQueryClient();
  const { data: regras = [] } = useQuery({
    queryKey: ["regras", nucleoId],
    queryFn: () => api.get<Regra[]>(`/faixas-colaborador/regras?nucleoId=${nucleoId}`),
  });
  const atualizar = useMutation({
    mutationFn: (p: { id: string; nivelClienteMaximo: string }) => api.put(`/faixas-colaborador/regras/${p.id}`, { nivelClienteMaximo: p.nivelClienteMaximo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras", nucleoId] }),
  });

  return (
    <div className="card p-4">
      <p className="mb-3 text-xs text-slate-500">
        Define até qual nível de cliente cada nível técnico do colaborador pode atender como responsável principal.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="pb-2 w-32">Nível Técnico</th>
            <th className="pb-2">Atende até o nível de cliente</th>
          </tr>
        </thead>
        <tbody>
          {regras.map((r) => (
            <tr key={r.id} className="border-b border-slate-50">
              <td className="py-2 font-semibold">{r.nivelTecnico}</td>
              <td className="py-2">
                <InlineEdit
                  value={r.nivelClienteMaximo}
                  type="select"
                  options={NIVEIS_CLIENTE.map((n) => ({ value: n, label: n }))}
                  onSave={(v) => atualizar.mutate({ id: r.id, nivelClienteMaximo: v })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbaTiposCliente({ nucleoId }: { nucleoId: string }) {
  const qc = useQueryClient();
  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos-cliente", nucleoId, "todos"],
    queryFn: () => api.get<TipoCliente[]>(`/tipos-cliente?nucleoId=${nucleoId}`),
  });
  const [novoNome, setNovoNome] = useState("");

  const criar = useMutation({
    mutationFn: () => api.post("/tipos-cliente", { nucleoId, nome: novoNome }),
    onSuccess: () => {
      setNovoNome("");
      qc.invalidateQueries({ queryKey: ["tipos-cliente", nucleoId] });
    },
  });
  const atualizar = useMutation({
    mutationFn: (p: { id: string; data: Partial<TipoCliente> }) => api.put(`/tipos-cliente/${p.id}`, p.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-cliente", nucleoId] }),
  });

  return (
    <div className="card p-4">
      <p className="mb-3 text-xs text-slate-500">
        Tipos de cliente são específicos deste núcleo (ex.: Folha, Pró-labore no Pessoal; Simples, Presumido no
        Fiscal). Eles aparecem no cadastro do cliente e no relatório "Clientes por tipo".
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="pb-2">Tipo</th>
            <th className="pb-2 w-24">Status</th>
          </tr>
        </thead>
        <tbody>
          {tipos.map((t) => (
            <tr key={t.id} className="border-b border-slate-50">
              <td className="py-2 pr-2">
                <InlineEdit value={t.nome} onSave={(v) => atualizar.mutate({ id: t.id, data: { nome: v } })} />
              </td>
              <td className="py-2">
                <AtivoToggle ativo={t.ativo} onChange={(ativo) => atualizar.mutate({ id: t.id, data: { ativo } })} />
              </td>
            </tr>
          ))}
          {tipos.length === 0 && (
            <tr>
              <td colSpan={2} className="py-6 text-center text-slate-400">
                Nenhum tipo cadastrado neste núcleo ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex gap-2">
        <input className="input" placeholder="Novo tipo de cliente..." value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!novoNome.trim()} onClick={() => criar.mutate()}>
          Adicionar
        </button>
      </div>
    </div>
  );
}
