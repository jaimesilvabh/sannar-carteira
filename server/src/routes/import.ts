import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";
import { importarPlanilhaPessoal } from "../services/excelImport";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

export const importRouter = Router();
importRouter.use(requireAuth);

importRouter.post(
  "/pessoal",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  upload.single("arquivo"),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Nenhum arquivo enviado (campo 'arquivo').");
    const nucleoPessoal = await prisma.nucleo.findUnique({ where: { nome: "Pessoal" } });
    if (!nucleoPessoal) throw new HttpError(500, "Núcleo Pessoal não encontrado — rode o seed do banco.");
    assertNucleoAccess(req, nucleoPessoal.id);

    const relatorio = await importarPlanilhaPessoal(req.file.buffer, nucleoPessoal.id);
    await registrarAuditoria({
      userId: req.user!.userId,
      acao: "IMPORTAR",
      entidade: "Cliente",
      detalhe: { arquivo: req.file.originalname, ...relatorio },
    });
    res.json(relatorio);
  })
);
