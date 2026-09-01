import { prisma } from "../lib/prisma";
import { nivelClienteRank } from "../lib/constants";
import { calcularPontuacoesClientes } from "./scoring";

export interface SugestaoColaborador {
  colaboradorId: string;
  nome: string;
  nivelTecnico: string;
  nClientesAtivos: number;
  pontuacaoCarteiraAtual: number;
  capacidadeMaximaPontos: number | null;
  cargaRelativa: number; // menor = mais folga na carteira
}

/**
 * Sugere colaboradores aptos (nível técnico compatível, via RegraCorrespondencia ou
 * exceção pontual) para receber um cliente de determinado nível, ordenados por menor
 * carga relativa (pontuação atual da carteira / capacidade máxima; sem capacidade
 * definida, cai para nº de clientes ativos como aproximação — seção 8 do prompt).
 */
export async function sugerirColaboradores(
  nucleoId: string,
  nivelCliente: string,
  top = 5
): Promise<SugestaoColaborador[]> {
  const [colaboradores, regras] = await Promise.all([
    prisma.colaborador.findMany({ where: { nucleoId, ativo: true } }),
    prisma.regraCorrespondencia.findMany({ where: { nucleoId } }),
  ]);

  const regraMap = new Map(regras.map((r) => [r.nivelTecnico, r.nivelClienteMaximo]));
  const aptos = colaboradores.filter((c) => {
    const max = c.excecaoNivelClienteMax ?? regraMap.get(c.nivelTecnico);
    if (!max) return false;
    return nivelClienteRank(nivelCliente) <= nivelClienteRank(max);
  });

  const resultados: SugestaoColaborador[] = [];
  for (const colaborador of aptos) {
    const alocacoesAtivas = await prisma.alocacao.findMany({
      where: { colaboradorId: colaborador.id, nucleoId, dataFim: null },
    });
    const clienteIds = alocacoesAtivas.map((a) => a.clienteId);
    const pontuacoes = await calcularPontuacoesClientes(clienteIds, nucleoId);
    const pontuacaoTotal = [...pontuacoes.values()].reduce((sum, p) => sum + p.pontuacaoTotal, 0);
    const carga = colaborador.capacidadeMaximaPontos
      ? pontuacaoTotal / colaborador.capacidadeMaximaPontos
      : clienteIds.length;

    resultados.push({
      colaboradorId: colaborador.id,
      nome: colaborador.nome,
      nivelTecnico: colaborador.nivelTecnico,
      nClientesAtivos: clienteIds.length,
      pontuacaoCarteiraAtual: pontuacaoTotal,
      capacidadeMaximaPontos: colaborador.capacidadeMaximaPontos ?? null,
      cargaRelativa: carga,
    });
  }

  resultados.sort((a, b) => a.cargaRelativa - b.cargaRelativa);
  return resultados.slice(0, top);
}

/** Cria uma alocação, fechando (dataFim) qualquer alocação ativa anterior do mesmo cliente no núcleo. */
export async function alocarCliente(params: {
  clienteId: string;
  colaboradorId: string;
  nucleoId: string;
  origem: "MANUAL" | "SUGESTAO";
}) {
  const anterior = await prisma.alocacao.findFirst({
    where: { clienteId: params.clienteId, nucleoId: params.nucleoId, dataFim: null },
  });
  if (anterior) {
    await prisma.alocacao.update({ where: { id: anterior.id }, data: { dataFim: new Date() } });
  }
  return prisma.alocacao.create({
    data: {
      clienteId: params.clienteId,
      colaboradorId: params.colaboradorId,
      nucleoId: params.nucleoId,
      origem: params.origem,
      dataInicio: new Date(),
    },
  });
}
