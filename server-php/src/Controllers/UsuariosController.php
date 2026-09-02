<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Uuid;

class UsuariosController
{
    private static function ensureDirecao(): void
    {
        Auth::requireRole('DIRECAO');
    }

    public static function list(array $params): void
    {
        self::ensureDirecao();
        $stmt = Database::get()->query('SELECT id, email, nome, role, nucleoId, ativo, createdAt FROM user ORDER BY nome ASC');
        Http::json($stmt->fetchAll());
    }

    public static function create(array $params): void
    {
        self::ensureDirecao();
        $body = Http::body();
        $email = strtolower(trim(Http::required($body, 'email')));
        $nome = Http::required($body, 'nome');
        $role = Http::required($body, 'role');
        if ($role === 'LIDER_NUCLEO' && empty($body['nucleoId'])) {
            throw new HttpException(400, 'Líder de núcleo precisa de nucleoId');
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM user WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetchColumn()) {
            throw new HttpException(409, 'Já existe um usuário com este e-mail');
        }

        $senha = bin2hex(random_bytes(6));
        $hash = Auth::hashPassword($senha);
        $id = Uuid::v4();
        $nucleoId = $role === 'LIDER_NUCLEO' ? $body['nucleoId'] : null;
        $pdo->prepare('INSERT INTO user (id, email, passwordHash, nome, role, nucleoId, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)')
            ->execute([$id, $email, $hash, $nome, $role, $nucleoId]);

        Audit::registrar('CRIAR', 'User', $id, ['email' => $email, 'nome' => $nome, 'role' => $role]);
        Http::json(['id' => $id, 'email' => $email, 'nome' => $nome, 'role' => $role, 'nucleoId' => $nucleoId, 'senhaTemporaria' => $senha], 201);
    }

    public static function update(array $params): void
    {
        self::ensureDirecao();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM user WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Usuário não encontrado');
        }
        $body = Http::body();
        $nome = $body['nome'] ?? $existente['nome'];
        $role = $body['role'] ?? $existente['role'];
        $nucleoId = $role === 'DIRECAO' ? null : ($body['nucleoId'] ?? $existente['nucleoId']);
        $ativo = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? 1 : 0) : $existente['ativo'];

        $pdo->prepare('UPDATE user SET nome=?, role=?, nucleoId=?, ativo=? WHERE id=?')
            ->execute([$nome, $role, $nucleoId, $ativo, $params['id']]);
        Audit::registrar('ATUALIZAR', 'User', $params['id'], $body);
        Http::json(['id' => $params['id'], 'email' => $existente['email'], 'nome' => $nome, 'role' => $role, 'nucleoId' => $nucleoId, 'ativo' => (bool) $ativo]);
    }

    public static function resetSenha(array $params): void
    {
        self::ensureDirecao();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM user WHERE id = ?');
        $stmt->execute([$params['id']]);
        if (!$stmt->fetchColumn()) {
            throw new HttpException(404, 'Usuário não encontrado');
        }
        $senha = bin2hex(random_bytes(6));
        $pdo->prepare('UPDATE user SET passwordHash=? WHERE id=?')->execute([Auth::hashPassword($senha), $params['id']]);
        Audit::registrar('RESET_SENHA', 'User', $params['id']);
        Http::json(['senhaTemporaria' => $senha]);
    }

    public static function delete(array $params): void
    {
        self::ensureDirecao();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM user WHERE id = ?');
        $stmt->execute([$params['id']]);
        if (!$stmt->fetchColumn()) {
            throw new HttpException(404, 'Usuário não encontrado');
        }
        $pdo->prepare('UPDATE user SET ativo=0 WHERE id=?')->execute([$params['id']]);
        Audit::registrar('DESATIVAR', 'User', $params['id']);
        Http::json(['ok' => true]);
    }
}
