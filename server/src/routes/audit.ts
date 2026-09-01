import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ah } from "../lib/httpError";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("DIRECAO"));

auditRouter.get(
  "/",
  ah(async (req, res) => {
    const limite = Math.min(Number(req.query.limit ?? 200), 1000);
    const registros = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limite });
    const userIds = [...new Set(registros.map((r) => r.userId).filter((id): id is string => !!id))];
    const usuarios = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true, email: true } });
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
    res.json(
      registros.map((r) => ({
        ...r,
        detalhe: r.detalhe ? JSON.parse(r.detalhe) : null,
        usuario: r.userId ? usuarioPorId.get(r.userId) ?? null : null,
      }))
    );
  })
);
