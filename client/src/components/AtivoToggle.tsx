export function AtivoToggle({ ativo, onChange, disabled }: { ativo: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!ativo)}
      className={`badge cursor-pointer ${ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
      title="Clique para alternar"
    >
      {ativo ? "Ativo" : "Inativo"}
    </button>
  );
}
