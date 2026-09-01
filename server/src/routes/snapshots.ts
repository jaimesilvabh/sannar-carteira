import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";
import { calcularPontuacoesClientes } from "../services/scoring";

export const snapshotsRouter = Router();
snapshotsRouter.use(requireAuth);

/** Grava CarteiraSnapshotMensal para todos os colaboradores do núcleo, usado pelo motor de alertas (seção 10). */
snapshotsRouter.post(
  "/recalcular",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const mes = Number(required(req.body.mes, "mes"));
    const ano = Number(required(req.body.ano, "ano"));

    const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId, ativo: true } });
    let gravados = 0;
    for (const colaborador of colaboradores) {
      const alocacoes = await prisma.alocacao.findMany({ where: { colaboradorId: colaborador.id, nucleoId, dataFim: null } });
      const pontuacoes = await calcularPontuacoesClientes(alocacoes.map((a) => a.clienteId), nucleoId);
      const pontuacaoTotal = [...pontuacoes.values()].reduce((s, p) => s + p.pontuacaoTotal, 0);
      await prisma.carteiraSnapshotMensal.upsert({
        where: { colaboradorId_mes_ano: { colaboradorId: colaborador.id, mes, ano } },
        update: { pontuacaoTotal, nClientes: alocacoes.length },
        create: { colaboradorId: colaborador.id, mes, ano, pontuacaoTotal, nClientes: alocacoes.length },
      });
      gravados++;
    }
    await registrarAuditoria({ userId: req.user!.userId, acao: "RECALCULAR_SNAPSHOT", entidade: "CarteiraSnapshotMensal", detalhe: { nucleoId, mes, ano, gravados } });
    res.json({ gravados });
  })
);
