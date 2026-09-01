import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess, scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";
import { alocarCliente, sugerirColaboradores } from "../services/allocationSuggestion";
import { calcularPontuacaoCliente, calcularPontuacoesClientes } from "../services/scoring";
import { NIVEIS_CLIENTE } from "../lib/constants";

export const alocacoesRouter = Router();
alocacoesRouter.use(requireAuth);

alocacoesRouter.get(
  "/",
  ah(async (req, res) => {
    const nucleoId = req.query.nucleoId as string | undefined;
    if (nucleoId) assertNucleoAccess(req, nucleoId);
    const permitidos = scopedNucleoIds(req);

    const alocacoes = await prisma.alocacao.findMany({
      where: {
        ...(nucleoId ? { nucleoId } : permitidos ? { nucleoId: { in: permitidos } } : {}),
        colaboradorId: (req.query.colaboradorId as string) || undefined,
        clienteId: (req.query.clienteId as string) || undefined,
        dataFim: req.query.ativo === "false" ? { not: null } : null,
      },
      include: { cliente: true, colaborador: true },
      orderBy: { dataInicio: "desc" },
    });
    res.json(alocacoes);
  })
);

alocacoesRouter.post(
  "/sugestao",
  ah(async (req, res) => {
    const clienteId = required(req.body.clienteId, "clienteId");
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);

    const pontuacao = await calcularPontuacaoCliente(clienteId, nucleoId);
    if (!pontuacao.nivel) {
      throw new HttpError(400, "Cliente ainda não foi avaliado neste núcleo — não é possível sugerir alocação.");
    }
    const sugestoes = await sugerirColaboradores(nucleoId, pontuacao.nivel, Number(req.query.top ?? 5));
    res.json({ nivelCliente: pontuacao.nivel, pontuacaoTotal: pontuacao.pontuacaoTotal, sugestoes });
  })
);

alocacoesRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const clienteId = required(req.body.clienteId, "clienteId");
    const colaboradorId = required(req.body.colaboradorId, "colaboradorId");
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const origem = req.body.origem === "SUGESTAO" ? "SUGESTAO" : "MANUAL";

    const alocacao = await alocarCliente({ clienteId, colaboradorId, nucleoId, origem });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ALOCAR", entidade: "Alocacao", entidadeId: alocacao.id, detalhe: { clienteId, colaboradorId, nucleoId, origem } });
    res.status(201).json(alocacao);
  })
);

/** Matriz núcleo x colaborador x nível de cliente — onde há espaço e onde há saturação (seção 8). */
alocacoesRouter.get(
  "/mapa",
  ah(async (req, res) => {
    const nucleoId = required(req.query.nucleoId as string, "nucleoId");
    assertNucleoAccess(req, nucleoId);

    const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId, ativo: true }, orderBy: { nome: "asc" } });
    const alocacoesAtivas = await prisma.alocacao.findMany({ where: { nucleoId, dataFim: null } });
    const clienteIds = [...new Set(alocacoesAtivas.map((a) => a.clienteId))];
    const pontuacoes = await calcularPontuacoesClientes(clienteIds, nucleoId);

    const linhas = colaboradores.map((colaborador) => {
      const clientesDoColaborador = alocacoesAtivas.filter((a) => a.colaboradorId === colaborador.id);
      const porNivel: Record<string, number> = Object.fromEntries(NIVEIS_CLIENTE.map((n) => [n, 0]));
      let pontuacaoTotal = 0;
      for (const a of clientesDoColaborador) {
        const p = pontuacoes.get(a.clienteId);
        if (p?.nivel) porNivel[p.nivel]++;
        pontuacaoTotal += p?.pontuacaoTotal ?? 0;
      }
      return {
        colaboradorId: colaborador.id,
        nome: colaborador.nome,
        nivelTecnico: colaborador.nivelTecnico,
        capacidadeMaximaPontos: colaborador.capacidadeMaximaPontos,
        pontuacaoTotal,
        cargaRelativa: colaborador.capacidadeMaximaPontos ? pontuacaoTotal / colaborador.capacidadeMaximaPontos : null,
        clientesPorNivel: porNivel,
        totalClientes: clientesDoColaborador.length,
      };
    });

    res.json({ niveis: NIVEIS_CLIENTE, linhas });
  })
);
