import { Router } from "express";
import { prisma } from "../lib/prisma";
import { verifyPassword, hashPassword } from "../auth/hash";
import { signToken } from "../auth/jwt";
import { ah, HttpError, required } from "../lib/httpError";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 12 * 60 * 60 * 1000,
};

authRouter.post(
  "/login",
  ah(async (req, res) => {
    const email = required(req.body.email, "email").toLowerCase().trim();
    const password = required(req.body.password, "password");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.ativo || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "E-mail ou senha inválidos");
    }

    const token = signToken({ userId: user.id, role: user.role as "DIRECAO" | "LIDER_NUCLEO", nucleoId: user.nucleoId });
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ id: user.id, email: user.email, nome: user.nome, role: user.role, nucleoId: user.nucleoId });
  })
);

authRouter.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new HttpError(401, "Usuário não encontrado");
    res.json({ id: user.id, email: user.email, nome: user.nome, role: user.role, nucleoId: user.nucleoId });
  })
);

authRouter.post(
  "/alterar-senha",
  requireAuth,
  ah(async (req, res) => {
    const senhaAtual = required(req.body.senhaAtual, "senhaAtual");
    const novaSenha = required(req.body.novaSenha, "novaSenha");
    if (novaSenha.length < 6) throw new HttpError(400, "A nova senha deve ter ao menos 6 caracteres");

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !(await verifyPassword(senhaAtual, user.passwordHash))) {
      throw new HttpError(401, "Senha atual incorreta");
    }
    const passwordHash = await hashPassword(novaSenha);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ ok: true });
  })
);
