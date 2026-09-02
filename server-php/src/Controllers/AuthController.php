<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;

class AuthController
{
    public static function login(array $params): void
    {
        $body = Http::body();
        $email = strtolower(trim(Http::required($body, 'email')));
        $password = Http::required($body, 'password');

        $stmt = Database::get()->prepare('SELECT * FROM user WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !$user['ativo'] || !Auth::verifyPassword($password, $user['passwordHash'])) {
            throw new HttpException(401, 'E-mail ou senha inválidos');
        }

        Auth::login($user['id'], $user['role'], $user['nucleoId']);
        Http::json([
            'id' => $user['id'], 'email' => $user['email'], 'nome' => $user['nome'],
            'role' => $user['role'], 'nucleoId' => $user['nucleoId'],
        ]);
    }

    public static function logout(array $params): void
    {
        Auth::logout();
        Http::json(['ok' => true]);
    }

    public static function me(array $params): void
    {
        Auth::requireAuth();
        $stmt = Database::get()->prepare('SELECT * FROM user WHERE id = ?');
        $stmt->execute([Auth::userId()]);
        $user = $stmt->fetch();
        if (!$user) {
            throw new HttpException(401, 'Usuário não encontrado');
        }
        Http::json([
            'id' => $user['id'], 'email' => $user['email'], 'nome' => $user['nome'],
            'role' => $user['role'], 'nucleoId' => $user['nucleoId'],
        ]);
    }

    public static function alterarSenha(array $params): void
    {
        Auth::requireAuth();
        $body = Http::body();
        $senhaAtual = Http::required($body, 'senhaAtual');
        $novaSenha = Http::required($body, 'novaSenha');
        if (strlen($novaSenha) < 6) {
            throw new HttpException(400, 'A nova senha deve ter ao menos 6 caracteres');
        }

        $stmt = Database::get()->prepare('SELECT * FROM user WHERE id = ?');
        $stmt->execute([Auth::userId()]);
        $user = $stmt->fetch();
        if (!$user || !Auth::verifyPassword($senhaAtual, $user['passwordHash'])) {
            throw new HttpException(401, 'Senha atual incorreta');
        }

        $update = Database::get()->prepare('UPDATE user SET passwordHash = ? WHERE id = ?');
        $update->execute([Auth::hashPassword($novaSenha), $user['id']]);
        Http::json(['ok' => true]);
    }
}
