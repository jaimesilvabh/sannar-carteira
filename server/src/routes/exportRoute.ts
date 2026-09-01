import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError } from "../lib/httpError";
import { exportarPlanilhaPessoal } from "../services/excelExport";

export const exportRouter = Router();
exportRouter.use(requireAuth);

exportRouter.get(
  "/pessoal.xlsx",
  ah(async (req, res) => {
    const nucleoPessoal = await prisma.nucleo.findUnique({ where: { nome: "Pessoal" } });
    if (!nucleoPessoal) throw new HttpError(500, "Núcleo Pessoal não encontrado — rode o seed do banco.");
    assertNucleoAccess(req, nucleoPessoal.id);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

    const buffer = await exportarPlanilhaPessoal(nucleoPessoal.id, ano);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="carteira-pessoal-${ano}.xlsx"`);
    res.send(buffer);
  })
);
