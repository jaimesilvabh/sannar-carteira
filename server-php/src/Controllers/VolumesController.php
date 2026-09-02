<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Uuid;

class VolumesController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $clienteId = Http::required($_GET, 'clienteId');
        $ano = Http::query('ano');
        $where = ['clienteId = ?', 'ativo = 1'];
        $args = [$clienteId];
        if ($ano) { $where[] = 'ano = ?'; $args[] = $ano; }
        $sql = 'SELECT * FROM volumemensalcliente WHERE ' . implode(' AND ', $where) . ' ORDER BY ano ASC, mes ASC';
        $stmt = Database::get()->prepare($sql);
        $stmt->execute($args);
        Http::json($stmt->fetchAll());
    }

    public static function upsert(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $clienteId = Http::required($body, 'clienteId');
        $mes = (int) Http::required($body, 'mes');
        $ano = (int) Http::required($body, 'ano');

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM volumemensalcliente WHERE clienteId=? AND mes=? AND ano=?');
        $stmt->execute([$clienteId, $mes, $ano]);
        $id = $stmt->fetchColumn();

        $vals = [
            $body['nEmpregados'] ?? null, $body['nSocios'] ?? null,
            $body['nAutonomos'] ?? null, $body['nEstagiarios'] ?? null,
        ];
        if ($id) {
            $pdo->prepare('UPDATE volumemensalcliente SET nEmpregados=?, nSocios=?, nAutonomos=?, nEstagiarios=?, ativo=1 WHERE id=?')
                ->execute([...$vals, $id]);
        } else {
            $id = Uuid::v4();
            $pdo->prepare('INSERT INTO volumemensalcliente (id, clienteId, mes, ano, nEmpregados, nSocios, nAutonomos, nEstagiarios, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
                ->execute([$id, $clienteId, $mes, $ano, ...$vals]);
        }

        Audit::registrar('LANCAR', 'VolumeMensalCliente', $id, $body);
        $stmt = $pdo->prepare('SELECT * FROM volumemensalcliente WHERE id = ?');
        $stmt->execute([$id]);
        Http::json($stmt->fetch(), 201);
    }

    public static function delete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM volumemensalcliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        if (!$stmt->fetchColumn()) {
            throw new HttpException(404, 'Registro não encontrado');
        }
        $pdo->prepare('UPDATE volumemensalcliente SET ativo=0 WHERE id=?')->execute([$params['id']]);
        Audit::registrar('EXCLUIR', 'VolumeMensalCliente', $params['id']);
        Http::json(['ok' => true]);
    }
}
