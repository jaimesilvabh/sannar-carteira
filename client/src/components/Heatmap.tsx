const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function corParaEficiencia(v: number | null): string {
  if (v === null) return "#e2e8f0";
  const clamped = Math.max(0, Math.min(1.2, v));
  // vermelho (baixa) -> amarelo -> verde (alta)
  if (clamped < 0.5) return "#ef4444";
  if (clamped < 0.7) return "#f97316";
  if (clamped < 0.85) return "#eab308";
  if (clamped <= 1.05) return "#22c55e";
  return "#0ea5e9"; // acima de ~105%: destaque (pode indicar sobrecarga de horas)
}

export function HeatmapGrid({ linhas }: { linhas: { label: string; heatmap: { mes: number; eficiencia: number | null }[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white text-left font-medium text-slate-500 pr-3 py-1">Colaborador</th>
            {MESES_ABREV.map((m) => (
              <th key={m} className="px-1 py-1 font-medium text-slate-500 text-center">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.label}>
              <td className="sticky left-0 bg-white pr-3 py-1 font-medium text-slate-700 whitespace-nowrap">{linha.label}</td>
              {linha.heatmap.map((cel) => (
                <td key={cel.mes} className="p-0.5">
                  <div
                    className="h-7 w-9 rounded flex items-center justify-center text-[10px] text-white font-semibold"
                    style={{ backgroundColor: corParaEficiencia(cel.eficiencia) }}
                    title={cel.eficiencia !== null ? `${(cel.eficiencia * 100).toFixed(0)}%` : "sem dado"}
                  >
                    {cel.eficiencia !== null ? Math.round(cel.eficiencia * 100) : ""}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
