import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ah } from "../lib/httpError";

export const nucleosRouter = Router();
nucleosRouter.use(requireAuth);

nucleosRouter.get(
  "/",
  ah(async (req, res) => {
    const where = req.user!.role === "DIRECAO" ? {} : { id: req.user!.nucleoId ?? "__nenhum__" };
    const nucleos = await prisma.nucleo.findMany({ where, orderBy: { nome: "asc" } });
    res.json(nucleos);
  })
);
