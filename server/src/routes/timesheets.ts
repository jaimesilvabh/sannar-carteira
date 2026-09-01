import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const timesheetsRouter = Router();
timesheetsRouter.use(requireAuth);

timesheetsRouter.get(
  "/",
  ah(async (req, res) => {
    const colaboradorId = req.query.colaboradorId as string | undefined;
    const ano = req.query.ano ? Number(req.query.ano) : undefined;
    if (colaboradorId) {
      const colaborador = await prisma.colaborador.findUnique({ where: { id: colaboradorId } });
      if (colaborador) assertNucleoAccess(req, colaborador.nucleoId);
    }
    const registros = await prisma.timesheetMensal.findMany({
      where: { colaboradorId, ano, ativo: true },
      orderBy: [{ ano: "asc" }, { mes: "asc" }],
    });
    res.json(registros);
  })
);

timesheetsRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const colaboradorId = required(req.body.colaboradorId, "colaboradorId");
    const colaborador = await prisma.colaborador.findUnique({ where: { id: colaboradorId } });
    if (!colaborador) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, colaborador.nucleoId);
    const mes = Number(required(req.body.mes, "mes"));
    const ano = Number(required(req.body.ano, "ano"));
    const eficiencia = Number(required(req.body.eficiencia, "eficiencia"));
    if (eficiencia < 0 || eficiencia > 200) throw new HttpError(400, "eficiencia deve estar entre 0 e 200 (%)");

    const registro = await prisma.timesheetMensal.upsert({
      where: { colaboradorId_mes_ano: { colaboradorId, mes, ano } },
      update: { eficiencia, observacao: req.body.observacao ?? null, ativo: true },
      create: { colaboradorId, mes, ano, eficiencia, observacao: req.body.observacao ?? null },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "LANCAR", entidade: "TimesheetMensal", entidadeId: registro.id, detalhe: req.body });
    res.status(201).json(registro);
  })
);

timesheetsRouter.delete(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.timesheetMensal.findUnique({ where: { id: req.params.id }, include: { colaborador: true } });
    if (!existente) throw new HttpError(404, "Registro não encontrado");
    assertNucleoAccess(req, existente.colaborador.nucleoId);
    await prisma.timesheetMensal.update({ where: { id: existente.id }, data: { ativo: false } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR", entidade: "TimesheetMensal", entidadeId: existente.id });
    res.json({ ok: true });
  })
);
