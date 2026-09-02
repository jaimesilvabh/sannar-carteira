<?php

namespace Sannar;

class Auth
{
    public static function hashPassword(string $plain): string
    {
        return password_hash($plain, PASSWORD_BCRYPT);
    }

    public static function verifyPassword(string $plain, string $hash): bool
    {
        return password_verify($plain, $hash);
    }

    public static function login(string $userId, string $role, ?string $nucleoId): void
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['role'] = $role;
        $_SESSION['nucleo_id'] = $nucleoId;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        session_destroy();
    }

    public static function userId(): ?string
    {
        return $_SESSION['user_id'] ?? null;
    }

    public static function role(): ?string
    {
        return $_SESSION['role'] ?? null;
    }

    public static function nucleoId(): ?string
    {
        return $_SESSION['nucleo_id'] ?? null;
    }

    public static function requireAuth(): void
    {
        if (self::userId() === null) {
            throw new HttpException(401, 'Não autenticado');
        }
    }

    /** @param string ...$roles */
    public static function requireRole(string ...$roles): void
    {
        self::requireAuth();
        if (!in_array(self::role(), $roles, true)) {
            throw new HttpException(403, 'Sem permissão para esta ação');
        }
    }
}
