import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess, scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const tiposClienteRouter = Router();
tiposClienteRouter.use(requireAuth);

tiposClienteRouter.get(
  "/",
  ah(async (req, res) => {
    const permitidos = scopedNucleoIds(req);
    const nucleoId = req.query.nucleoId as string | undefined;
    if (nucleoId) assertNucleoAccess(req, nucleoId);

    const tipos = await prisma.tipoCliente.findMany({
      where: {
        ...(nucleoId ? { nucleoId } : permitidos ? { nucleoId: { in: permitidos } } : {}),
      },
      orderBy: { nome: "asc" },
    });
    res.json(tipos);
  })
);

tiposClienteRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const nome = required(req.body.nome, "nome");

    const existente = await prisma.tipoCliente.findUnique({ where: { nucleoId_nome: { nucleoId, nome } } });
    if (existente) throw new HttpError(409, "Já existe um tipo com esse nome neste núcleo");

    const tipo = await prisma.tipoCliente.create({ data: { nucleoId, nome } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "CRIAR", entidade: "TipoCliente", entidadeId: tipo.id, detalhe: tipo });
    res.status(201).json(tipo);
  })
);

tiposClienteRouter.put(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.tipoCliente.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Tipo não encontrado");
    assertNucleoAccess(req, existente.nucleoId);

    const atualizado = await prisma.tipoCliente.update({
      where: { id: existente.id },
      data: {
        nome: req.body.nome ?? undefined,
        ativo: req.body.ativo !== undefined ? Boolean(req.body.ativo) : undefined,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "TipoCliente", entidadeId: atualizado.id, detalhe: req.body });
    res.json(atualizado);
  })
);
