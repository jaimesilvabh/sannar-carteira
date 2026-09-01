import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess, scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const criteriosRouter = Router();
criteriosRouter.use(requireAuth);

criteriosRouter.get(
  "/",
  ah(async (req, res) => {
    const permitidos = scopedNucleoIds(req);
    const nucleoId = req.query.nucleoId as string | undefined;
    if (nucleoId) assertNucleoAccess(req, nucleoId);

    const criterios = await prisma.criterioCliente.findMany({
      where: {
        ...(nucleoId ? { nucleoId } : permitidos ? { nucleoId: { in: permitidos } } : {}),
      },
      orderBy: { nome: "asc" },
    });
    res.json(criterios);
  })
);

criteriosRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const nome = required(req.body.nome, "nome");
    const criterio = await prisma.criterioCliente.create({
      data: { nucleoId, nome, descricao: req.body.descricao ?? null, peso: Number(req.body.peso ?? 1) },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "CRIAR", entidade: "CriterioCliente", entidadeId: criterio.id, detalhe: criterio });
    res.status(201).json(criterio);
  })
);

criteriosRouter.put(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.criterioCliente.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Critério não encontrado");
    assertNucleoAccess(req, existente.nucleoId);

    const atualizado = await prisma.criterioCliente.update({
      where: { id: existente.id },
      data: {
        nome: req.body.nome ?? undefined,
        descricao: req.body.descricao ?? undefined,
        peso: req.body.peso !== undefined ? Number(req.body.peso) : undefined,
        ativo: req.body.ativo !== undefined ? Boolean(req.body.ativo) : undefined,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "CriterioCliente", entidadeId: atualizado.id, detalhe: req.body });
    res.json(atualizado);
  })
);

criteriosRouter.delete(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.criterioCliente.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Critério não encontrado");
    assertNucleoAccess(req, existente.nucleoId);
    await prisma.criterioCliente.update({ where: { id: existente.id }, data: { ativo: false } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR", entidade: "CriterioCliente", entidadeId: existente.id });
    res.json({ ok: true });
  })
);

criteriosRouter.delete(
  "/:id/definitivo",
  requireRole("DIRECAO"),
  ah(async (req, res) => {
    const existente = await prisma.criterioCliente.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Critério não encontrado");
    await prisma.pontuacaoCriterioCliente.deleteMany({ where: { criterioId: existente.id } });
    await prisma.criterioCliente.delete({ where: { id: existente.id } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR_DEFINITIVO", entidade: "CriterioCliente", entidadeId: existente.id });
    res.json({ ok: true });
  })
);
