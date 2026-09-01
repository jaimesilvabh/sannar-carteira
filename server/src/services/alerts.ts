import { prisma } from "../lib/prisma";
import { nivelClienteRank } from "../lib/constants";
import { calcularPontuacoesClientes } from "./scoring";

export interface Alerta {
  tipo:
    | "SOBRECARGA"
    | "EFICIENCIA_EM_QUEDA"
    | "NECESSIDADE_CONTRATACAO"
    | "OPORTUNIDADE_REDISTRIBUICAO"
    | "ALOCACAO_INCOMPATIVEL"
    | "CUSTO_POR_PONTO_ALTO";
  severidade: "ALTA" | "MEDIA" | "BAIXA";
  titulo: string;
  nucleoId: string;
  colaboradorId?: string;
  clienteId?: string;
  dadosBrutos: Record<string, unknown>;
}

const MESES_CONSECUTIVOS_SOBRECARGA = 2;
const MESES_TENDENCIA_EFICIENCIA = 3;
const MULTIPLICADOR_CUSTO_ALTO = 1.5;

/** Gera todas as sinalizações estratégicas (seção 10). Sempre carrega o dado bruto que sustenta o alerta. */
export async function gerarAlertas(nucleoIdFiltro?: string): Promise<Alerta[]> {
  const alertas: Alerta[] = [];
  const whereNucleo = nucleoIdFiltro ? { nucleoId: nucleoIdFiltro } : {};

  const colaboradores = await prisma.colaborador.findMany({
    where: { ativo: true, ...whereNucleo },
    include: { nucleo: true },
  });

  const agora = new Date();
  const mesesRecentes = ultimosMeses(agora, Math.max(MESES_CONSECUTIVOS_SOBRECARGA, MESES_TENDENCIA_EFICIENCIA) + 1);

  for (const colaborador of colaboradores) {
    // 1. Sobrecarga: pontuação da carteira acima da capacidade máxima por N meses seguidos.
    if (colaborador.capacidadeMaximaPontos) {
      const snapshots = await prisma.carteiraSnapshotMensal.findMany({
        where: {
          colaboradorId: colaborador.id,
          OR: mesesRecentes.slice(0, MESES_CONSECUTIVOS_SOBRECARGA).map((m) => ({ mes: m.mes, ano: m.ano })),
        },
      });
      const consecutivos = mesesRecentes
        .slice(0, MESES_CONSECUTIVOS_SOBRECARGA)
        .every((m) => {
          const snap = snapshots.find((s) => s.mes === m.mes && s.ano === m.ano);
          return snap && snap.pontuacaoTotal > colaborador.capacidadeMaximaPontos!;
        });
      if (consecutivos && snapshots.length === MESES_CONSECUTIVOS_SOBRECARGA) {
        alertas.push({
          tipo: "SOBRECARGA",
          severidade: "ALTA",
          titulo: `${colaborador.nome} está acima da capacidade máxima há ${MESES_CONSECUTIVOS_SOBRECARGA} meses`,
          nucleoId: colaborador.nucleoId,
          colaboradorId: colaborador.id,
          dadosBrutos: { capacidadeMaximaPontos: colaborador.capacidadeMaximaPontos, snapshots },
        });
      }
    }

    // 2. Eficiência em queda: tendência negativa nos últimos 3 meses.
    const timesheets = await prisma.timesheetMensal.findMany({
      where: {
        colaboradorId: colaborador.id,
        ativo: true,
        OR: mesesRecentes.slice(0, MESES_TENDENCIA_EFICIENCIA).map((m) => ({ mes: m.mes, ano: m.ano })),
      },
    });
    const serieOrdenada = mesesRecentes
      .slice(0, MESES_TENDENCIA_EFICIENCIA)
      .reverse()
      .map((m) => timesheets.find((t) => t.mes === m.mes && t.ano === m.ano))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => eficienciaDoRegistro(t));

    if (serieOrdenada.length === MESES_TENDENCIA_EFICIENCIA && ehQuedaConsistente(serieOrdenada)) {
      alertas.push({
        tipo: "EFICIENCIA_EM_QUEDA",
        severidade: "MEDIA",
        titulo: `Eficiência de ${colaborador.nome} em queda nos últimos ${MESES_TENDENCIA_EFICIENCIA} meses`,
        nucleoId: colaborador.nucleoId,
        colaboradorId: colaborador.id,
        dadosBrutos: { serieEficiencia: serieOrdenada },
      });
    }

    // 6. Custo por ponto muito acima da média do núcleo — comparado depois do loop.
  }

  // 3. Núcleo crescendo mais rápido que capacidade instalada.
  const nucleoIds = [...new Set(colaboradores.map((c) => c.nucleoId))];
  for (const nucleoId of nucleoIds) {
    const colaboradoresDoNucleo = colaboradores.filter((c) => c.nucleoId === nucleoId);
    const capacidadeInstalada = colaboradoresDoNucleo.reduce((s, c) => s + (c.capacidadeMaximaPontos ?? 0), 0);
    const mesAtual = mesesRecentes[0];
    const mesAnterior = mesesRecentes[MESES_CONSECUTIVOS_SOBRECARGA] ?? mesesRecentes[1];
    const [snapAtual, snapAnterior] = await Promise.all([
      prisma.carteiraSnapshotMensal.findMany({
        where: { colaboradorId: { in: colaboradoresDoNucleo.map((c) => c.id) }, mes: mesAtual.mes, ano: mesAtual.ano },
      }),
      prisma.carteiraSnapshotMensal.findMany({
        where: { colaboradorId: { in: colaboradoresDoNucleo.map((c) => c.id) }, mes: mesAnterior.mes, ano: mesAnterior.ano },
      }),
    ]);
    const totalAtual = snapAtual.reduce((s, x) => s + x.pontuacaoTotal, 0);
    const totalAnterior = snapAnterior.reduce((s, x) => s + x.pontuacaoTotal, 0);
    if (totalAnterior > 0 && capacidadeInstalada > 0) {
      const crescimentoCarteira = (totalAtual - totalAnterior) / totalAnterior;
      if (crescimentoCarteira > 0 && totalAtual > capacidadeInstalada * 0.9) {
        alertas.push({
          tipo: "NECESSIDADE_CONTRATACAO",
          severidade: "ALTA",
          titulo: `Núcleo está próximo/acima da capacidade instalada e crescendo`,
          nucleoId,
          dadosBrutos: { totalAtual, totalAnterior, capacidadeInstalada, crescimentoCarteira },
        });
      }
    }

    // 4. Oportunidade de redistribuição: alguém sobrecarregado + alguém com folga e boa eficiência.
    const cargas = await Promise.all(
      colaboradoresDoNucleo.map(async (c) => {
        const snap = snapAtual.find((s) => s.colaboradorId === c.id);
        const carga = c.capacidadeMaximaPontos && snap ? snap.pontuacaoTotal / c.capacidadeMaximaPontos : null;
        const ts = await prisma.timesheetMensal.findFirst({
          where: { colaboradorId: c.id, mes: mesAtual.mes, ano: mesAtual.ano, ativo: true },
        });
        return { colaborador: c, carga, eficiencia: ts ? eficienciaDoRegistro(ts) : null };
      })
    );
    const sobrecarregados = cargas.filter((c) => c.carga !== null && c.carga > 1);
    const comFolga = cargas.filter((c) => c.carga !== null && c.carga < 0.7 && c.eficiencia !== null && c.eficiencia >= 80);
    for (const sobrecarregado of sobrecarregados) {
      for (const folgado of comFolga) {
        alertas.push({
          tipo: "OPORTUNIDADE_REDISTRIBUICAO",
          severidade: "BAIXA",
          titulo: `${folgado.colaborador.nome} tem folga e boa eficiência — pode receber clientes de ${sobrecarregado.colaborador.nome}`,
          nucleoId,
          colaboradorId: folgado.colaborador.id,
          dadosBrutos: {
            colaboradorSobrecarregado: sobrecarregado.colaborador.nome,
            cargaSobrecarregado: sobrecarregado.carga,
            colaboradorComFolga: folgado.colaborador.nome,
            cargaComFolga: folgado.carga,
            eficienciaComFolga: folgado.eficiencia,
          },
        });
      }
    }
  }

  // 5. Alocação incompatível: nível do cliente > nível técnico permitido do colaborador.
  const alocacoesAtivas = await prisma.alocacao.findMany({
    where: { dataFim: null, ...whereNucleo },
    include: { cliente: true, colaborador: true },
  });
  const regras = await prisma.regraCorrespondencia.findMany({ where: nucleoIdFiltro ? { nucleoId: nucleoIdFiltro } : {} });
  const regraMap = new Map(regras.map((r) => [`${r.nucleoId}|${r.nivelTecnico}`, r.nivelClienteMaximo]));
  const porNucleo = new Map<string, string[]>();
  for (const a of alocacoesAtivas) {
    porNucleo.set(a.nucleoId, [...(porNucleo.get(a.nucleoId) ?? []), a.clienteId]);
  }
  for (const [nucleoId, clienteIds] of porNucleo) {
    const pontuacoes = await calcularPontuacoesClientes([...new Set(clienteIds)], nucleoId);
    for (const a of alocacoesAtivas.filter((x) => x.nucleoId === nucleoId)) {
      const nivelCliente = pontuacoes.get(a.clienteId)?.nivel;
      if (!nivelCliente) continue;
      const maxPermitido = a.colaborador.excecaoNivelClienteMax ?? regraMap.get(`${nucleoId}|${a.colaborador.nivelTecnico}`);
      if (maxPermitido && nivelClienteRank(nivelCliente) > nivelClienteRank(maxPermitido)) {
        alertas.push({
          tipo: "ALOCACAO_INCOMPATIVEL",
          severidade: "ALTA",
          titulo: `${a.cliente.nome} (nível ${nivelCliente}) está com ${a.colaborador.nome}, que atende até ${maxPermitido}`,
          nucleoId,
          colaboradorId: a.colaboradorId,
          clienteId: a.clienteId,
          dadosBrutos: { nivelCliente, nivelMaximoColaborador: maxPermitido, nivelTecnico: a.colaborador.nivelTecnico },
        });
      }
    }
  }

  // 6. Custo por ponto muito acima da média do núcleo.
  for (const nucleoId of nucleoIds) {
    const colaboradoresDoNucleo = colaboradores.filter((c) => c.nucleoId === nucleoId);
    const custos = await Promise.all(
      colaboradoresDoNucleo.map(async (c) => {
        const ativas = await prisma.alocacao.findMany({ where: { colaboradorId: c.id, nucleoId, dataFim: null } });
        const pontuacoes = await calcularPontuacoesClientes(ativas.map((a) => a.clienteId), nucleoId);
        const total = [...pontuacoes.values()].reduce((s, p) => s + p.pontuacaoTotal, 0);
        return { colaborador: c, custoPorPonto: total > 0 ? c.remuneracaoTotal / total : null };
      })
    );
    const validos = custos.filter((c) => c.custoPorPonto !== null) as { colaborador: (typeof custos)[number]["colaborador"]; custoPorPonto: number }[];
    if (validos.length === 0) continue;
    const media = validos.reduce((s, c) => s + c.custoPorPonto, 0) / validos.length;
    for (const c of validos) {
      if (c.custoPorPonto > media * MULTIPLICADOR_CUSTO_ALTO) {
        alertas.push({
          tipo: "CUSTO_POR_PONTO_ALTO",
          severidade: "MEDIA",
          titulo: `Custo por ponto de ${c.colaborador.nome} está bem acima da média do núcleo`,
          nucleoId,
          colaboradorId: c.colaborador.id,
          dadosBrutos: { custoPorPonto: c.custoPorPonto, mediaNucleo: media, multiplicador: MULTIPLICADOR_CUSTO_ALTO },
        });
      }
    }
  }

  return alertas;
}

function ultimosMeses(base: Date, quantidade: number): { mes: number; ano: number }[] {
  const out: { mes: number; ano: number }[] = [];
  let mes = base.getMonth() + 1;
  let ano = base.getFullYear();
  for (let i = 0; i < quantidade; i++) {
    out.push({ mes, ano });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return out;
}

function eficienciaDoRegistro(t: { eficiencia: number }): number {
  return t.eficiencia;
}

function ehQuedaConsistente(serie: number[]): boolean {
  for (let i = 1; i < serie.length; i++) {
    if (serie[i] >= serie[i - 1]) return false;
  }
  return true;
}
