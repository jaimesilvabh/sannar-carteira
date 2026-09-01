import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess, scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const colaboradoresRouter = Router();
colaboradoresRouter.use(requireAuth);

colaboradoresRouter.get(
  "/",
  ah(async (req, res) => {
    const nucleoId = req.query.nucleoId as string | undefined;
    if (nucleoId) assertNucleoAccess(req, nucleoId);
    const permitidos = scopedNucleoIds(req);
    // "todos" = sem filtro (tela de listagem mostra ativo/inativo); "false" = só inativos; padrão = só ativos.
    const filtroAtivo = req.query.ativo === "todos" ? undefined : req.query.ativo === "false" ? false : true;

    const colaboradores = await prisma.colaborador.findMany({
      where: {
        ...(nucleoId ? { nucleoId } : permitidos ? { nucleoId: { in: permitidos } } : {}),
        ativo: filtroAtivo,
      },
      orderBy: { nome: "asc" },
    });
    res.json(colaboradores);
  })
);

colaboradoresRouter.get(
  "/:id",
  ah(async (req, res) => {
    const colaborador = await prisma.colaborador.findUnique({
      where: { id: req.params.id },
      include: { historicoNiveis: { orderBy: { dataInicio: "asc" } } },
    });
    if (!colaborador) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, colaborador.nucleoId);
    res.json(colaborador);
  })
);

colaboradoresRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const nome = required(req.body.nome, "nome");
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const nivelTecnico = required(req.body.nivelTecnico, "nivelTecnico");

    const colaborador = await prisma.colaborador.create({
      data: {
        nome,
        nucleoId,
        nivelTecnico,
        dataAdmissao: req.body.dataAdmissao ? new Date(req.body.dataAdmissao) : null,
        remuneracaoTotal: Number(req.body.remuneracaoTotal ?? 0),
        capacidadeMaximaPontos: req.body.capacidadeMaximaPontos !== undefined ? Number(req.body.capacidadeMaximaPontos) : null,
        historicoNiveis: { create: { nivelTecnico } },
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "CRIAR", entidade: "Colaborador", entidadeId: colaborador.id, detalhe: { ...req.body, remuneracaoTotal: undefined } });
    res.status(201).json(colaborador);
  })
);

colaboradoresRouter.put(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, existente.nucleoId);

    const mudouNivel = req.body.nivelTecnico !== undefined && req.body.nivelTecnico !== existente.nivelTecnico;
    const mudouRemuneracao = req.body.remuneracaoTotal !== undefined && Number(req.body.remuneracaoTotal) !== existente.remuneracaoTotal;

    const atualizado = await prisma.colaborador.update({
      where: { id: existente.id },
      data: {
        nome: req.body.nome ?? undefined,
        nivelTecnico: req.body.nivelTecnico ?? undefined,
        dataAdmissao: req.body.dataAdmissao ? new Date(req.body.dataAdmissao) : undefined,
        remuneracaoTotal: req.body.remuneracaoTotal !== undefined ? Number(req.body.remuneracaoTotal) : undefined,
        capacidadeMaximaPontos: req.body.capacidadeMaximaPontos !== undefined ? Number(req.body.capacidadeMaximaPontos) : undefined,
        excecaoNivelClienteMax: req.body.excecaoNivelClienteMax !== undefined ? req.body.excecaoNivelClienteMax : undefined,
      },
    });

    if (mudouNivel) {
      await prisma.colaboradorNivelHistorico.create({ data: { colaboradorId: existente.id, nivelTecnico: req.body.nivelTecnico } });
    }
    if (mudouRemuneracao) {
      await registrarAuditoria({ userId: req.user!.userId, acao: "ALTERAR_REMUNERACAO", entidade: "Colaborador", entidadeId: existente.id, detalhe: { de: existente.remuneracaoTotal, para: req.body.remuneracaoTotal } });
    }
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "Colaborador", entidadeId: atualizado.id, detalhe: { ...req.body, remuneracaoTotal: undefined } });
    res.json(atualizado);
  })
);

colaboradoresRouter.delete(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, existente.nucleoId);
    await prisma.colaborador.update({ where: { id: existente.id }, data: { ativo: false, deletedAt: new Date() } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR", entidade: "Colaborador", entidadeId: existente.id });
    res.json({ ok: true });
  })
);

colaboradoresRouter.delete(
  "/:id/definitivo",
  requireRole("DIRECAO"),
  ah(async (req, res) => {
    const id = req.params.id;
    await prisma.colaboradorNivelHistorico.deleteMany({ where: { colaboradorId: id } });
    await prisma.timesheetMensal.deleteMany({ where: { colaboradorId: id } });
    await prisma.carteiraSnapshotMensal.deleteMany({ where: { colaboradorId: id } });
    await prisma.alocacao.deleteMany({ where: { colaboradorId: id } });
    await prisma.colaborador.delete({ where: { id } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR_DEFINITIVO", entidade: "Colaborador", entidadeId: id });
    res.json({ ok: true });
  })
);

colaboradoresRouter.post(
  "/batch/delete",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const ids: string[] = required(req.body.ids, "ids");
    await validarAcessoColaboradores(req, ids);
    const r = await prisma.colaborador.updateMany({ where: { id: { in: ids } }, data: { ativo: false, deletedAt: new Date() } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR_LOTE", entidade: "Colaborador", detalhe: { ids } });
    res.json({ afetados: r.count });
  })
);

colaboradoresRouter.post(
  "/batch/toggle-active",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const ids: string[] = required(req.body.ids, "ids");
    const ativo = Boolean(req.body.ativo);
    await validarAcessoColaboradores(req, ids);
    const r = await prisma.colaborador.updateMany({ where: { id: { in: ids } }, data: { ativo, deletedAt: ativo ? null : new Date() } });
    await registrarAuditoria({ userId: req.user!.userId, acao: ativo ? "ATIVAR_LOTE" : "DESATIVAR_LOTE", entidade: "Colaborador", detalhe: { ids } });
    res.json({ afetados: r.count });
  })
);

async function validarAcessoColaboradores(req: import("express").Request, ids: string[]) {
  const permitidos = scopedNucleoIds(req);
  if (!permitidos) return;
  const colaboradores = await prisma.colaborador.findMany({ where: { id: { in: ids } } });
  if (colaboradores.some((c) => !permitidos.includes(c.nucleoId))) {
    throw new HttpError(403, "Um ou mais colaboradores não pertencem ao seu núcleo");
  }
}
