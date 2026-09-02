<?php

namespace Sannar;

class HttpException extends \Exception
{
    public int $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

class Http
{
    private static ?array $bodyCache = null;

    /** Corpo da requisição, decodificado de JSON (ou array vazio se não houver / não for JSON). */
    public static function body(): array
    {
        if (self::$bodyCache === null) {
            $raw = file_get_contents('php://input');
            $decoded = $raw ? json_decode($raw, true) : null;
            self::$bodyCache = is_array($decoded) ? $decoded : [];
        }
        return self::$bodyCache;
    }

    public static function query(string $key): ?string
    {
        return isset($_GET[$key]) && $_GET[$key] !== '' ? (string) $_GET[$key] : null;
    }

    public static function required(array $data, string $key): mixed
    {
        if (!isset($data[$key]) || $data[$key] === '' || $data[$key] === null) {
            throw new HttpException(400, "Campo obrigatório: {$key}");
        }
        return $data[$key];
    }

    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function boolFromJson(mixed $v, bool $default = false): bool
    {
        if ($v === null) return $default;
        return $v === true || $v === 'true' || $v === 1 || $v === '1';
    }
}
