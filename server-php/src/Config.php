<?php

namespace Sannar;

/** Lê variáveis de configuração de um arquivo .env simples (sem dependências externas). */
class Config
{
    private static ?array $values = null;

    public static function get(): array
    {
        if (self::$values === null) {
            $envPath = __DIR__ . '/../.env';
            $values = [
                'db_host' => 'localhost',
                'db_port' => '3306',
                'db_name' => 'sannar_carteira',
                'db_user' => 'root',
                'db_pass' => '',
                'client_origin' => 'http://localhost:5173',
                'session_name' => 'sannar_session',
            ];
            if (is_file($envPath)) {
                foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                    $line = trim($line);
                    if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                        continue;
                    }
                    [$key, $value] = explode('=', $line, 2);
                    $key = strtolower(trim($key));
                    $value = trim($value, " \t\n\r\0\x0B\"'");
                    $map = [
                        'db_host' => 'db_host', 'db_port' => 'db_port', 'db_name' => 'db_name',
                        'db_user' => 'db_user', 'db_pass' => 'db_pass', 'client_origin' => 'client_origin',
                    ];
                    if (isset($map[$key])) {
                        $values[$map[$key]] = $value;
                    }
                }
            }
            self::$values = $values;
        }
        return self::$values;
    }
}
