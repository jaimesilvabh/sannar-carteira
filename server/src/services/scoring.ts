import { prisma } from "../lib/prisma";

export interface DetalheCriterio {
  criterioId: string;
  nome: string;
  peso: number;
  valor: number | null;
}

export interface ResultadoPontuacao {
  clienteId: string;
  pontuacaoTotal: number;
  nivel: string | null;
  avaliado: boolean;
  detalhePorCriterio: DetalheCriterio[];
}

/**
 * Calcula a pontuação e o nível de um conjunto de clientes num núcleo, de forma batelada
 * (evita N+1 queries). Usa, por critério, a pontuação de `mesReferencia` se informado e
 * existir; caso contrário cai para o lançamento mais recente (modo "estático" — vale até
 * nova reavaliação, conforme seção 3.5 do prompt).
 */
export async function calcularPontuacoesClientes(
  clienteIds: string[],
  nucleoId: string,
  mesReferencia?: string
): Promise<Map<string, ResultadoPontuacao>> {
  const resultado = new Map<string, ResultadoPontuacao>();
  if (clienteIds.length === 0) return resultado;

  const [criterios, pontuacoes, faixas] = await Promise.all([
    prisma.criterioCliente.findMany({ where: { nucleoId, ativo: true } }),
    prisma.pontuacaoCriterioCliente.findMany({
      where: { clienteId: { in: clienteIds }, nucleoId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.faixaNivelCliente.findMany({ where: { nucleoId }, orderBy: { pontuacaoMin: "asc" } }),
  ]);

  const porClienteCriterio = new Map<string, typeof pontuacoes>();
  for (const p of pontuacoes) {
    const key = `${p.clienteId}|${p.criterioId}`;
    const arr = porClienteCriterio.get(key) ?? [];
    arr.push(p);
    porClienteCriterio.set(key, arr);
  }

  for (const clienteId of clienteIds) {
    let total = 0;
    let algumAvaliado = false;
    const detalhe: DetalheCriterio[] = [];

    for (const criterio of criterios) {
      const registros = porClienteCriterio.get(`${clienteId}|${criterio.id}`) ?? [];
      let valor: number | null = null;
      if (mesReferencia) {
        valor = registros.find((r) => r.mesReferencia === mesReferencia)?.valor ?? null;
      }
      if (valor === null) {
        valor = registros[0]?.valor ?? null; // já ordenado desc por createdAt
      }
      if (valor !== null) {
        algumAvaliado = true;
        total += valor * criterio.peso;
      }
      detalhe.push({ criterioId: criterio.id, nome: criterio.nome, peso: criterio.peso, valor });
    }

    resultado.set(clienteId, {
      clienteId,
      pontuacaoTotal: total,
      nivel: algumAvaliado ? nivelParaPontuacao(total, faixas) : null,
      avaliado: algumAvaliado,
      detalhePorCriterio: detalhe,
    });
  }

  return resultado;
}

export async function calcularPontuacaoCliente(
  clienteId: string,
  nucleoId: string,
  mesReferencia?: string
): Promise<ResultadoPontuacao> {
  const map = await calcularPontuacoesClientes([clienteId], nucleoId, mesReferencia);
  return (
    map.get(clienteId) ?? {
      clienteId,
      pontuacaoTotal: 0,
      nivel: null,
      avaliado: false,
      detalhePorCriterio: [],
    }
  );
}

function nivelParaPontuacao(
  total: number,
  faixas: { nivel: string; pontuacaoMin: number; pontuacaoMax: number }[]
): string | null {
  if (faixas.length === 0) return null;
  const dentro = faixas.find((f) => total >= f.pontuacaoMin && total <= f.pontuacaoMax);
  if (dentro) return dentro.nivel;
  // fora de todas as faixas: satura no menor ou maior nível conhecido
  const menor = faixas[0];
  const maior = faixas[faixas.length - 1];
  return total < menor.pontuacaoMin ? menor.nivel : maior.nivel;
}
