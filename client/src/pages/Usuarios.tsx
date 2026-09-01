import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useNucleo } from "../lib/NucleoContext";
import { Modal } from "../components/Modal";

interface Usuario {
  id: string;
  email: string;
  nome: string;
  role: "DIRECAO" | "LIDER_NUCLEO";
  nucleoId: string | null;
  ativo: boolean;
}

export function Usuarios() {
  const qc = useQueryClient();
  const { nucleos } = useNucleo();
  const [novoOpen, setNovoOpen] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);

  const { data: usuarios = [] } = useQuery({ queryKey: ["usuarios"], queryFn: () => api.get<Usuario[]>("/usuarios") });

  const toggleAtivo = useMutation({
    mutationFn: (p: { id: string; ativo: boolean }) => api.put(`/usuarios/${p.id}`, { ativo: p.ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });

  const resetSenha = useMutation({
    mutationFn: (id: string) => api.post<{ senhaTemporaria: string }>(`/usuarios/${id}/reset-senha`),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Usuários</h1>
        <button className="btn-primary" onClick={() => setNovoOpen(true)}>
          + Novo usuário
        </button>
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
              <th className="pb-2">Nome</th>
              <th className="pb-2">E-mail</th>
              <th className="pb-2">Perfil</th>
              <th className="pb-2">Núcleo</th>
              <th className="pb-2">Ativo</th>
              <th className="pb-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="py-2">{u.nome}</td>
                <td className="py-2 text-slate-500">{u.email}</td>
                <td className="py-2">{u.role === "DIRECAO" ? "Direção" : "Líder de Núcleo"}</td>
                <td className="py-2">{nucleos.find((n) => n.id === u.nucleoId)?.nome ?? "—"}</td>
                <td className="py-2">
                  <input type="checkbox" checked={u.ativo} onChange={(e) => toggleAtivo.mutate({ id: u.id, ativo: e.target.checked })} />
                </td>
                <td className="py-2 text-right">
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      const r = await resetSenha.mutateAsync(u.id);
                      setSenhaGerada({ email: u.email, senha: r.senhaTemporaria });
                    }}
                  >
                    Resetar senha
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {novoOpen && <NovoUsuarioModal onClose={() => setNovoOpen(false)} onCriado={setSenhaGerada} />}

      <Modal open={!!senhaGerada} onClose={() => setSenhaGerada(null)} title="Senha temporária gerada">
        <p className="text-sm text-slate-600">
          Usuário: <strong>{senhaGerada?.email}</strong>
        </p>
        <p className="mt-2 rounded bg-slate-100 p-3 font-mono text-lg">{senhaGerada?.senha}</p>
        <p className="mt-2 text-xs text-slate-400">Compartilhe com o usuário por um canal seguro. Ele deve trocar a senha após o primeiro login.</p>
      </Modal>
    </div>
  );
}

function NovoUsuarioModal({ onClose, onCriado }: { onClose: () => void; onCriado: (v: { email: string; senha: string }) => void }) {
  const qc = useQueryClient();
  const { nucleos } = useNucleo();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<"DIRECAO" | "LIDER_NUCLEO">("LIDER_NUCLEO");
  const [nucleoId, setNucleoId] = useState("");

  const criar = useMutation({
    mutationFn: () => api.post<{ senhaTemporaria: string }>("/usuarios", { email, nome, role, nucleoId: role === "LIDER_NUCLEO" ? nucleoId : undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      onCriado({ email, senha: r.senhaTemporaria });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title="Novo usuário">
      <div className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Perfil</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "DIRECAO" | "LIDER_NUCLEO")}>
            <option value="LIDER_NUCLEO">Líder de Núcleo</option>
            <option value="DIRECAO">Direção</option>
          </select>
        </div>
        {role === "LIDER_NUCLEO" && (
          <div>
            <label className="label">Núcleo</label>
            <select className="input" value={nucleoId} onChange={(e) => setNucleoId(e.target.value)}>
              <option value="" disabled>
                Selecione...
              </option>
              {nucleos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!nome || !email || (role === "LIDER_NUCLEO" && !nucleoId) || criar.isPending} onClick={() => criar.mutate()}>
            Criar
          </button>
        </div>
      </div>
    </Modal>
  );
}
