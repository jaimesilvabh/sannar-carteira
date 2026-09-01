import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const faixasColaboradorRouter = Router();
faixasColaboradorRouter.use(requireAuth);

faixasColaboradorRouter.get(
  "/",
  ah(async (req, res) => {
    const nucleoId = required(req.query.nucleoId as string, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const faixas = await prisma.faixaNivelColaborador.findMany({ where: { nucleoId }, orderBy: { nivel: "asc" } });
    res.json(faixas);
  })
);

faixasColaboradorRouter.put(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.faixaNivelColaborador.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Faixa não encontrada");
    assertNucleoAccess(req, existente.nucleoId);
    const atualizada = await prisma.faixaNivelColaborador.update({
      where: { id: existente.id },
      data: { descricaoCompetencias: req.body.descricaoCompetencias ?? undefined },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "FaixaNivelColaborador", entidadeId: atualizada.id, detalhe: req.body });
    res.json(atualizada);
  })
);

// Regra de correspondência nível-cliente <-> nível-colaborador
faixasColaboradorRouter.get(
  "/regras",
  ah(async (req, res) => {
    const nucleoId = required(req.query.nucleoId as string, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const regras = await prisma.regraCorrespondencia.findMany({ where: { nucleoId }, orderBy: { nivelTecnico: "asc" } });
    res.json(regras);
  })
);

faixasColaboradorRouter.put(
  "/regras/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.regraCorrespondencia.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Regra não encontrada");
    assertNucleoAccess(req, existente.nucleoId);
    const nivelClienteMaximo = required(req.body.nivelClienteMaximo, "nivelClienteMaximo");
    const atualizada = await prisma.regraCorrespondencia.update({ where: { id: existente.id }, data: { nivelClienteMaximo } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "RegraCorrespondencia", entidadeId: atualizada.id, detalhe: req.body });
    res.json(atualizada);
  })
);
