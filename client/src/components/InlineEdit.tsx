import { useState, type ReactNode } from "react";

interface InlineEditProps {
  value: string | number;
  onSave: (novoValor: string) => void | Promise<void>;
  type?: "text" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  display?: (valor: string | number) => ReactNode;
  saving?: boolean;
  step?: string;
}

/** Campo com botão "Editar" -> vira input/select -> botão "Salvar"/"Cancelar". Padrão usado em toda a Configuração. */
export function InlineEdit({ value, onSave, type = "text", options, display, saving, step }: InlineEditProps) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(String(value));

  if (!editando) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">{display ? display(value) : String(value) || "—"}</span>
        <button
          className="text-xs text-brand-600 hover:underline"
          onClick={() => {
            setRascunho(String(value));
            setEditando(true);
          }}
        >
          Editar
        </button>
      </div>
    );
  }

  function salvar() {
    onSave(rascunho);
    setEditando(false);
  }

  return (
    <div className="flex items-center gap-1">
      {type === "textarea" ? (
        <textarea className="input" rows={2} value={rascunho} onChange={(e) => setRascunho(e.target.value)} autoFocus />
      ) : type === "select" ? (
        <select className="input !w-auto" value={rascunho} onChange={(e) => setRascunho(e.target.value)} autoFocus>
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          type={type}
          step={step}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && salvar()}
        />
      )}
      <button className="btn-primary !px-2 !py-1 !text-xs shrink-0" disabled={saving} onClick={salvar}>
        Salvar
      </button>
      <button className="btn-ghost !px-2 !py-1 !text-xs shrink-0" onClick={() => setEditando(false)}>
        Cancelar
      </button>
    </div>
  );
}
