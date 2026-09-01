export const NIVEIS_CLIENTE = ["N1", "N2", "N3", "N4"] as const;
export type NivelCliente = (typeof NIVEIS_CLIENTE)[number];

export const NIVEIS_TECNICOS = ["T1", "T2", "T3", "T4"] as const;
export type NivelTecnico = (typeof NIVEIS_TECNICOS)[number];

export const ROLES = ["DIRECAO", "LIDER_NUCLEO"] as const;
export type Role = (typeof ROLES)[number];

export const ORIGENS_ALOCACAO = ["MANUAL", "SUGESTAO"] as const;

export const NOMES_NUCLEOS = [
  "Fiscal",
  "Contábil",
  "Pessoal",
  "Societário",
  "Comercial",
  "Comunicação/Adm-financeiro",
] as const;

export const MESES_PT: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

// Ordem de precedência do nível (para comparações de "nível máximo permitido")
export function nivelClienteRank(nivel: string): number {
  return NIVEIS_CLIENTE.indexOf(nivel as NivelCliente);
}

export function nivelTecnicoRank(nivel: string): number {
  return NIVEIS_TECNICOS.indexOf(nivel as NivelTecnico);
}
