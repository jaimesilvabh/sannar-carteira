import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError } from "../lib/httpError";
import { calcularPontuacoesClientes } from "../services/scoring";
import { NIVEIS_CLIENTE } from "../lib/constants";

export const dashboardColaboradorRouter = Router();
dashboardColaboradorRouter.use(requireAuth);

dashboardColaboradorRouter.get(
  "/:id",
  ah(async (req, res) => {
    const colaborador = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!colaborador) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, colaborador.nucleoId);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

    const [alocacoesAtivas, totalClientesNucleo, totalClientesEmpresa, criterios] = await Promise.all([
      prisma.alocacao.findMany({ where: { colaboradorId: colaborador.id, nucleoId: colaborador.nucleoId, dataFim: null }, include: { cliente: true } }),
      prisma.clienteNucleo.count({ where: { nucleoId: colaborador.nucleoId, cliente: { ativo: true } } }),
      prisma.clienteNucleo.groupBy({ by: ["clienteId"], where: { cliente: { ativo: true } } }).then((g) => g.length),
      prisma.criterioCliente.findMany({ where: { nucleoId: colaborador.nucleoId, ativo: true } }),
    ]);

    const clienteIds = alocacoesAtivas.map((a) => a.clienteId);
    const pontuacoes = await calcularPontuacoesClientes(clienteIds, colaborador.nucleoId);

    const clientesPorNivel: Record<string, number> = Object.fromEntries(NIVEIS_CLIENTE.map((n) => [n, 0]));
    let naoAvaliados = 0;
    let pontuacaoTotal = 0;
    for (const clienteId of clienteIds) {
      const p = pontuacoes.get(clienteId);
      if (p?.nivel) {
        clientesPorNivel[p.nivel]++;
        pontuacaoTotal += p.pontuacaoTotal;
      } else {
        naoAvaliados++;
      }
    }

    const raioXPorCriterio = criterios.map((criterio) => {
      const distribuicao: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const clienteId of clienteIds) {
        const detalhe = pontuacoes.get(clienteId)?.detalhePorCriterio.find((d) => d.criterioId === criterio.id);
        if (detalhe?.valor) distribuicao[detalhe.valor]++;
      }
      return { criterioId: criterio.id, nome: criterio.nome, distribuicao };
    });

    const timesheets = await prisma.timesheetMensal.findMany({ where: { colaboradorId: colaborador.id, ano, ativo: true } });
    const heatmapEficiencia = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const t = timesheets.find((x) => x.mes === mes);
      return { mes, eficiencia: t ? t.eficiencia : null };
    });
    const mesesComDado = timesheets.filter((t) => t.eficiencia !== null);
    const produtividadeMedia = mesesComDado.length > 0 ? mesesComDado.reduce((s, t) => s + t.eficiencia, 0) / mesesComDado.length : null;

    const tiposVinculos = await prisma.clienteTipo.findMany({
      where: { clienteId: { in: clienteIds }, nucleoId: colaborador.nucleoId },
      include: { tipoCliente: true },
    });
    const tiposPorCliente = new Map<string, string[]>();
    for (const v of tiposVinculos) {
      const atual = tiposPorCliente.get(v.clienteId) ?? [];
      atual.push(v.tipoCliente.nome);
      tiposPorCliente.set(v.clienteId, atual);
    }

    const carteiraAnalitica = alocacoesAtivas
      .map((a) => {
        const p = pontuacoes.get(a.clienteId);
        return {
          clienteId: a.clienteId,
          nome: a.cliente.nome,
          contato: a.cliente.contato,
          tipos: tiposPorCliente.get(a.clienteId) ?? [],
          nivel: p?.nivel ?? null,
          pontuacaoTotal: p?.pontuacaoTotal ?? 0,
          desde: a.dataInicio,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));

    res.json({
      colaborador,
      totalClientes: clienteIds.length,
      naoAvaliados,
      clientesPorNivel,
      percentualSobreNucleo: totalClientesNucleo > 0 ? clienteIds.length / totalClientesNucleo : 0,
      percentualSobreEmpresa: totalClientesEmpresa > 0 ? clienteIds.length / totalClientesEmpresa : 0,
      pontuacaoTotal,
      capacidadeMaximaPontos: colaborador.capacidadeMaximaPontos,
      cargaRelativa: colaborador.capacidadeMaximaPontos ? pontuacaoTotal / colaborador.capacidadeMaximaPontos : null,
      custoPorPonto: pontuacaoTotal > 0 ? colaborador.remuneracaoTotal / pontuacaoTotal : null,
      raioXPorCriterio,
      heatmapEficiencia,
      produtividadeMedia,
      carteiraAnalitica,
      ano,
    });
  })
);
