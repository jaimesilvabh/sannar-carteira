import type { ReactNode } from "react";

const CORES_NIVEL: Record<string, string> = {
  N1: "bg-emerald-100 text-emerald-700",
  N2: "bg-sky-100 text-sky-700",
  N3: "bg-amber-100 text-amber-700",
  N4: "bg-red-100 text-red-700",
};

export function NivelBadge({ nivel }: { nivel: string | null | undefined }) {
  if (!nivel) return <span className="badge bg-slate-100 text-slate-500">Não avaliado</span>;
  return <span className={`badge ${CORES_NIVEL[nivel] ?? "bg-slate-100 text-slate-600"}`}>{nivel}</span>;
}

const CORES_SEVERIDADE: Record<string, string> = {
  ALTA: "bg-red-100 text-red-700",
  MEDIA: "bg-amber-100 text-amber-700",
  BAIXA: "bg-slate-100 text-slate-600",
};

export function SeveridadeBadge({ severidade }: { severidade: string }) {
  return <span className={`badge ${CORES_SEVERIDADE[severidade] ?? "bg-slate-100"}`}>{severidade}</span>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" }) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return <span className={`badge ${map[tone]}`}>{children}</span>;
}
