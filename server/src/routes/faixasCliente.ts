import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const faixasClienteRouter = Router();
faixasClienteRouter.use(requireAuth);

faixasClienteRouter.get(
  "/",
  ah(async (req, res) => {
    const nucleoId = required(req.query.nucleoId as string, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const faixas = await prisma.faixaNivelCliente.findMany({ where: { nucleoId }, orderBy: { pontuacaoMin: "asc" } });
    res.json(faixas);
  })
);

/**
 * Recalibra as 4 faixas do núcleo a partir da soma dos pesos dos critérios ativos, para que
 * a escala continue matematicamente coerente sempre que os pesos mudarem (em vez de faixas
 * fixas pensadas para peso=1). Cada faixa passa a corresponder a uma nota média por critério:
 * N1 = média < 2, N2 = média 2–3, N3 = média 3–4, N4 = média 4–5 (o teto real, dado que a
 * nota de cada critério vai de 1 a 5). Empate exato num limite cai na faixa mais baixa.
 */
faixasClienteRouter.post(
  "/recalibrar",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);

    const criterios = await prisma.criterioCliente.findMany({ where: { nucleoId, ativo: true } });
    const somaPesos = criterios.reduce((s, c) => s + c.peso, 0);
    if (somaPesos <= 0) throw new HttpError(400, "Não há critérios ativos com peso neste núcleo para calibrar as faixas.");

    const novasFaixas = [
      { nivel: "N1", pontuacaoMin: 0, pontuacaoMax: somaPesos * 2 },
      { nivel: "N2", pontuacaoMin: somaPesos * 2, pontuacaoMax: somaPesos * 3 },
      { nivel: "N3", pontuacaoMin: somaPesos * 3, pontuacaoMax: somaPesos * 4 },
      { nivel: "N4", pontuacaoMin: somaPesos * 4, pontuacaoMax: somaPesos * 5 },
    ];

    const existentes = await prisma.faixaNivelCliente.findMany({ where: { nucleoId } });
    for (const f of novasFaixas) {
      const existente = existentes.find((e) => e.nivel === f.nivel);
      if (existente) {
        await prisma.faixaNivelCliente.update({ where: { id: existente.id }, data: { pontuacaoMin: f.pontuacaoMin, pontuacaoMax: f.pontuacaoMax } });
      } else {
        await prisma.faixaNivelCliente.create({ data: { nucleoId, ...f } });
      }
    }

    await registrarAuditoria({
      userId: req.user!.userId,
      acao: "RECALIBRAR_FAIXAS",
      entidade: "FaixaNivelCliente",
      detalhe: { nucleoId, somaPesos, novasFaixas },
    });
    res.json({ somaPesos, faixas: novasFaixas });
  })
);

faixasClienteRouter.put(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.faixaNivelCliente.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Faixa não encontrada");
    assertNucleoAccess(req, existente.nucleoId);
    const atualizada = await prisma.faixaNivelCliente.update({
      where: { id: existente.id },
      data: {
        pontuacaoMin: req.body.pontuacaoMin !== undefined ? Number(req.body.pontuacaoMin) : undefined,
        pontuacaoMax: req.body.pontuacaoMax !== undefined ? Number(req.body.pontuacaoMax) : undefined,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "FaixaNivelCliente", entidadeId: atualizada.id, detalhe: req.body });
    res.json(atualizada);
  })
);
