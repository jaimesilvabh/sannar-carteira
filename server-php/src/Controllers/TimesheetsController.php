<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Uuid;

class TimesheetsController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $colaboradorId = Http::query('colaboradorId');
        $ano = Http::query('ano');
        if ($colaboradorId) {
            $stmt = Database::get()->prepare('SELECT nucleoId FROM colaborador WHERE id = ?');
            $stmt->execute([$colaboradorId]);
            $nucleoId = $stmt->fetchColumn();
            if ($nucleoId) {
                Rbac::assertNucleoAccess($nucleoId);
            }
        }
        $where = ['ativo = 1'];
        $args = [];
        if ($colaboradorId) { $where[] = 'colaboradorId = ?'; $args[] = $colaboradorId; }
        if ($ano) { $where[] = 'ano = ?'; $args[] = $ano; }
        $sql = 'SELECT * FROM timesheetmensal WHERE ' . implode(' AND ', $where) . ' ORDER BY ano ASC, mes ASC';
        $stmt = Database::get()->prepare($sql);
        $stmt->execute($args);
        Http::json($stmt->fetchAll());
    }

    public static function upsert(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $colaboradorId = Http::required($body, 'colaboradorId');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT nucleoId FROM colaborador WHERE id = ?');
        $stmt->execute([$colaboradorId]);
        $nucleoId = $stmt->fetchColumn();
        if (!$nucleoId) {
            throw new HttpException(404, 'Colaborador não encontrado');
        }
        Rbac::assertNucleoAccess($nucleoId);

        $mes = (int) Http::required($body, 'mes');
        $ano = (int) Http::required($body, 'ano');
        $eficiencia = (float) Http::required($body, 'eficiencia');
        if ($eficiencia < 0 || $eficiencia > 200) {
            throw new HttpException(400, 'eficiencia deve estar entre 0 e 200 (%)');
        }

        $stmt = $pdo->prepare('SELECT id FROM timesheetmensal WHERE colaboradorId=? AND mes=? AND ano=?');
        $stmt->execute([$colaboradorId, $mes, $ano]);
        $id = $stmt->fetchColumn();
        if ($id) {
            $pdo->prepare('UPDATE timesheetmensal SET eficiencia=?, observacao=?, ativo=1 WHERE id=?')
                ->execute([$eficiencia, $body['observacao'] ?? null, $id]);
        } else {
            $id = Uuid::v4();
            $pdo->prepare('INSERT INTO timesheetmensal (id, colaboradorId, mes, ano, eficiencia, observacao, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)')
                ->execute([$id, $colaboradorId, $mes, $ano, $eficiencia, $body['observacao'] ?? null]);
        }

        Audit::registrar('LANCAR', 'TimesheetMensal', $id, $body);
        $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE id = ?');
        $stmt->execute([$id]);
        Http::json($stmt->fetch(), 201);
    }

    public static function delete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT t.*, c.nucleoId FROM timesheetmensal t INNER JOIN colaborador c ON c.id = t.colaboradorId WHERE t.id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Registro não encontrado');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $pdo->prepare('UPDATE timesheetmensal SET ativo=0 WHERE id=?')->execute([$params['id']]);
        Audit::registrar('EXCLUIR', 'TimesheetMensal', $params['id']);
        Http::json(['ok' => true]);
    }
}
