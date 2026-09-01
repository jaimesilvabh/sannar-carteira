import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ah, HttpError, required } from "../lib/httpError";
import { gerarSenhaTemporaria, hashPassword } from "../auth/hash";
import { registrarAuditoria } from "../services/audit";

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth, requireRole("DIRECAO"));

usuariosRouter.get(
  "/",
  ah(async (req, res) => {
    const usuarios = await prisma.user.findMany({
      select: { id: true, email: true, nome: true, role: true, nucleoId: true, ativo: true, createdAt: true },
      orderBy: { nome: "asc" },
    });
    res.json(usuarios);
  })
);

usuariosRouter.post(
  "/",
  ah(async (req, res) => {
    const email = required(req.body.email, "email").toLowerCase().trim();
    const nome = required(req.body.nome, "nome");
    const role = required(req.body.role, "role");
    if (role === "LIDER_NUCLEO" && !req.body.nucleoId) throw new HttpError(400, "Líder de núcleo precisa de nucleoId");

    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) throw new HttpError(409, "Já existe um usuário com este e-mail");

    const senha = gerarSenhaTemporaria();
    const passwordHash = await hashPassword(senha);
    const usuario = await prisma.user.create({
      data: { email, nome, role, nucleoId: role === "LIDER_NUCLEO" ? req.body.nucleoId : null, passwordHash },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "CRIAR", entidade: "User", entidadeId: usuario.id, detalhe: { email, nome, role } });
    res.status(201).json({ id: usuario.id, email: usuario.email, nome: usuario.nome, role: usuario.role, nucleoId: usuario.nucleoId, senhaTemporaria: senha });
  })
);

usuariosRouter.put(
  "/:id",
  ah(async (req, res) => {
    const existente = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Usuário não encontrado");
    const atualizado = await prisma.user.update({
      where: { id: existente.id },
      data: {
        nome: req.body.nome ?? undefined,
        role: req.body.role ?? undefined,
        nucleoId: req.body.role === "DIRECAO" ? null : req.body.nucleoId ?? undefined,
        ativo: req.body.ativo !== undefined ? Boolean(req.body.ativo) : undefined,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "User", entidadeId: atualizado.id, detalhe: req.body });
    res.json({ id: atualizado.id, email: atualizado.email, nome: atualizado.nome, role: atualizado.role, nucleoId: atualizado.nucleoId, ativo: atualizado.ativo });
  })
);

usuariosRouter.post(
  "/:id/reset-senha",
  ah(async (req, res) => {
    const existente = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Usuário não encontrado");
    const senha = gerarSenhaTemporaria();
    const passwordHash = await hashPassword(senha);
    await prisma.user.update({ where: { id: existente.id }, data: { passwordHash } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "RESET_SENHA", entidade: "User", entidadeId: existente.id });
    res.json({ senhaTemporaria: senha });
  })
);

usuariosRouter.delete(
  "/:id",
  ah(async (req, res) => {
    const existente = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new HttpError(404, "Usuário não encontrado");
    await prisma.user.update({ where: { id: existente.id }, data: { ativo: false } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "DESATIVAR", entidade: "User", entidadeId: existente.id });
    res.json({ ok: true });
  })
);
