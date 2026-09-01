import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";

export const volumesRouter = Router();
volumesRouter.use(requireAuth);

volumesRouter.get(
  "/",
  ah(async (req, res) => {
    const clienteId = required(req.query.clienteId as string, "clienteId");
    const ano = req.query.ano ? Number(req.query.ano) : undefined;
    const registros = await prisma.volumeMensalCliente.findMany({
      where: { clienteId, ano, ativo: true },
      orderBy: [{ ano: "asc" }, { mes: "asc" }],
    });
    res.json(registros);
  })
);

volumesRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const clienteId = required(req.body.clienteId, "clienteId");
    const mes = Number(required(req.body.mes, "mes"));
    const ano = Number(required(req.body.ano, "ano"));
    const registro = await prisma.volumeMensalCliente.upsert({
      where: { clienteId_mes_ano: { clienteId, mes, ano } },
      update: {
        nEmpregados: req.body.nEmpregados ?? null,
        nSocios: req.body.nSocios ?? null,
        nAutonomos: req.body.nAutonomos ?? null,
        nEstagiarios: req.body.nEstagiarios ?? null,
        ativo: true,
      },
      create: {
        clienteId,
        mes,
        ano,
        nEmpregados: req.body.nEmpregados ?? null,
        nSocios: req.body.nSocios ?? null,
        nAutonomos: req.body.nAutonomos ?? null,
        nEstagiarios: req.body.nEstagiarios ?? null,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "LANCAR", entidade: "VolumeMensalCliente", entidadeId: registro.id, detalhe: req.body });
    res.status(201).json(registro);
  })
);

volumesRouter.delete(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.volumeMensalCliente.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Registro não encontrado");
    await prisma.volumeMensalCliente.update({ where: { id: existente.id }, data: { ativo: false } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR", entidade: "VolumeMensalCliente", entidadeId: existente.id });
    res.json({ ok: true });
  })
);
