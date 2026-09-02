<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;

class AuditController
{
    public static function list(array $params): void
    {
        Auth::requireRole('DIRECAO');
        $limite = min((int) (Http::query('limit') ?? 200), 1000);
        $stmt = Database::get()->prepare('SELECT * FROM auditlog ORDER BY createdAt DESC LIMIT ' . $limite);
        $stmt->execute();
        $registros = $stmt->fetchAll();

        $userIds = array_values(array_unique(array_filter(array_column($registros, 'userId'))));
        $usuarios = [];
        if (count($userIds) > 0) {
            $ph = implode(',', array_fill(0, count($userIds), '?'));
            $stmt = Database::get()->prepare("SELECT id, nome, email FROM user WHERE id IN ($ph)");
            $stmt->execute($userIds);
            foreach ($stmt->fetchAll() as $u) { $usuarios[$u['id']] = $u; }
        }

        $out = array_map(function ($r) use ($usuarios) {
            $r['detalhe'] = $r['detalhe'] ? json_decode($r['detalhe'], true) : null;
            $r['usuario'] = $r['userId'] ? ($usuarios[$r['userId']] ?? null) : null;
            return $r;
        }, $registros);
        Http::json($out);
    }
}
