import type { ReactNode } from "react";

export function BatchActionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-2 text-sm">
      <span className="font-medium text-brand-800">{count} selecionado(s)</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
      <button className="btn-ghost" onClick={onClear}>
        Limpar seleção
      </button>
    </div>
  );
}
