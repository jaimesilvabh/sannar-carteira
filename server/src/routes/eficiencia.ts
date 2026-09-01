import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess, scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, required } from "../lib/httpError";

export const eficienciaRouter = Router();
eficienciaRouter.use(requireAuth);

function eficienciaDoRegistro(t: { eficiencia: number } | undefined): number | null {
  return t ? t.eficiencia : null;
}

function heatmap12(registros: { mes: number; eficiencia: number }[]) {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    return { mes, eficiencia: eficienciaDoRegistro(registros.find((r) => r.mes === mes)) };
  });
}

/** Visão 1: heatmap por colaborador, lado a lado (seção 9.1). */
eficienciaRouter.get(
  "/colaboradores",
  ah(async (req, res) => {
    const nucleoId = required(req.query.nucleoId as string, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

    const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId, ativo: true }, orderBy: { nome: "asc" } });
    const resultado = [];
    for (const c of colaboradores) {
      const registros = await prisma.timesheetMensal.findMany({ where: { colaboradorId: c.id, ano, ativo: true } });
      resultado.push({ colaboradorId: c.id, nome: c.nome, heatmap: heatmap12(registros) });
    }
    res.json(resultado);
  })
);

/** Visão 2: eficiência média por núcleo, mês a mês (seção 9.2). */
eficienciaRouter.get(
  "/nucleos",
  ah(async (req, res) => {
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const permitidos = scopedNucleoIds(req);
    const nucleos = await prisma.nucleo.findMany({ where: permitidos ? { id: { in: permitidos } } : {} });

    const resultado = [];
    for (const nucleo of nucleos) {
      const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId: nucleo.id, ativo: true } });
      const registros = await prisma.timesheetMensal.findMany({ where: { colaboradorId: { in: colaboradores.map((c) => c.id) }, ano, ativo: true } });
      const heatmap = Array.from({ length: 12 }, (_, i) => {
        const mes = i + 1;
        const doMes = registros.filter((r) => r.mes === mes).map(eficienciaDoRegistro).filter((v): v is number => v !== null);
        return { mes, eficiencia: doMes.length > 0 ? doMes.reduce((a, b) => a + b, 0) / doMes.length : null };
      });
      resultado.push({ nucleoId: nucleo.id, nome: nucleo.nome, heatmap });
    }
    res.json(resultado);
  })
);

/** Visão 3: eficiência consolidada da empresa, mês a mês (seção 9.3) — restrito à Direção. */
eficienciaRouter.get(
  "/empresa",
  requireRole("DIRECAO"),
  ah(async (req, res) => {
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const registros = await prisma.timesheetMensal.findMany({ where: { ano, ativo: true } });
    const heatmap = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const doMes = registros.filter((r) => r.mes === mes).map(eficienciaDoRegistro).filter((v): v is number => v !== null);
      return { mes, eficiencia: doMes.length > 0 ? doMes.reduce((a, b) => a + b, 0) / doMes.length : null };
    });
    res.json({ heatmap });
  })
);
