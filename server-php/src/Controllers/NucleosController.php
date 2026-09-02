<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;

class NucleosController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        if (Auth::role() === 'DIRECAO') {
            $stmt = Database::get()->query('SELECT * FROM nucleo ORDER BY nome ASC');
            Http::json($stmt->fetchAll());
            return;
        }
        $stmt = Database::get()->prepare('SELECT * FROM nucleo WHERE id = ? ORDER BY nome ASC');
        $stmt->execute([Auth::nucleoId() ?? '__nenhum__']);
        Http::json($stmt->fetchAll());
    }
}
