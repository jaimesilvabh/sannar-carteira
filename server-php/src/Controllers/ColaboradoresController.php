<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Uuid;

class ColaboradoresController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::query('nucleoId');
        if ($nucleoId) {
            Rbac::assertNucleoAccess($nucleoId);
        }
        $permitidos = Rbac::scopedNucleoIds();
        $ativoParam = Http::query('ativo');
        $filtroAtivo = $ativoParam === 'todos' ? null : ($ativoParam === 'false' ? 0 : 1);

        $where = [];
        $args = [];
        if ($nucleoId) {
            $where[] = 'nucleoId = ?';
            $args[] = $nucleoId;
        } elseif ($permitidos !== null) {
            if (count($permitidos) === 0) {
                Http::json([]);
                return;
            }
            $ph = implode(',', array_fill(0, count($permitidos), '?'));
            $where[] = "nucleoId IN ($ph)";
            array_push($args, ...$permitidos);
        }
        if ($filtroAtivo !== null) {
            $where[] = 'ativo = ?';
            $args[] = $filtroAtivo;
        }
        $whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
        $stmt = Database::get()->prepare("SELECT * FROM colaborador $whereSql ORDER BY nome ASC");
        $stmt->execute($args);
        Http::json($stmt->fetchAll());
    }

    public static function get(array $params): void
    {
        Auth::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE id = ?');
        $stmt->execute([$params['id']]);
        $colaborador = $stmt->fetch();
        if (!$colaborador) {
            throw new HttpException(404, 'Colaborador não encontrado');
        }
        Rbac::assertNucleoAccess($colaborador['nucleoId']);

        $stmt = $pdo->prepare('SELECT * FROM colaboradornivelhistorico WHERE colaboradorId = ? ORDER BY dataInicio ASC');
        $stmt->execute([$params['id']]);
        $colaborador['historicoNiveis'] = $stmt->fetchAll();
        Http::json($colaborador);
    }

    public static function create(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nome = Http::required($body, 'nome');
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $nivelTecnico = Http::required($body, 'nivelTecnico');

        $pdo = Database::get();
        $id = Uuid::v4();
        $pdo->prepare('INSERT INTO colaborador (id, nome, nucleoId, nivelTecnico, dataAdmissao, ativo, remuneracaoTotal, capacidadeMaximaPontos) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
            ->execute([
                $id, $nome, $nucleoId, $nivelTecnico,
                !empty($body['dataAdmissao']) ? $body['dataAdmissao'] : null,
                (float) ($body['remuneracaoTotal'] ?? 0),
                isset($body['capacidadeMaximaPontos']) && $body['capacidadeMaximaPontos'] !== null ? (float) $body['capacidadeMaximaPontos'] : null,
            ]);
        $pdo->prepare('INSERT INTO colaboradornivelhistorico (id, colaboradorId, nivelTecnico, dataInicio) VALUES (?, ?, ?, NOW())')
            ->execute([Uuid::v4(), $id, $nivelTecnico]);

        Audit::registrar('CRIAR', 'Colaborador', $id, ['nome' => $nome, 'nucleoId' => $nucleoId, 'nivelTecnico' => $nivelTecnico]);
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE id = ?');
        $stmt->execute([$id]);
        Http::json($stmt->fetch(), 201);
    }

    public static function update(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Colaborador não encontrado');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $body = Http::body();

        $nome = $body['nome'] ?? $existente['nome'];
        $nivelTecnico = $body['nivelTecnico'] ?? $existente['nivelTecnico'];
        $mudouNivel = $nivelTecnico !== $existente['nivelTecnico'];
        $remuneracaoTotal = isset($body['remuneracaoTotal']) ? (float) $body['remuneracaoTotal'] : $existente['remuneracaoTotal'];
        $mudouRemuneracao = isset($body['remuneracaoTotal']) && (float) $body['remuneracaoTotal'] !== (float) $existente['remuneracaoTotal'];
        $capacidade = array_key_exists('capacidadeMaximaPontos', $body)
            ? ($body['capacidadeMaximaPontos'] !== null ? (float) $body['capacidadeMaximaPontos'] : null)
            : $existente['capacidadeMaximaPontos'];
        $dataAdmissao = !empty($body['dataAdmissao']) ? $body['dataAdmissao'] : $existente['dataAdmissao'];
        $ativo = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? 1 : 0) : $existente['ativo'];
        $deletedAt = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? null : date('Y-m-d H:i:s')) : $existente['deletedAt'];
        $excecao = array_key_exists('excecaoNivelClienteMax', $body) ? $body['excecaoNivelClienteMax'] : $existente['excecaoNivelClienteMax'];

        $pdo->prepare('UPDATE colaborador SET nome=?, nivelTecnico=?, dataAdmissao=?, remuneracaoTotal=?, capacidadeMaximaPontos=?, ativo=?, deletedAt=?, excecaoNivelClienteMax=? WHERE id=?')
            ->execute([$nome, $nivelTecnico, $dataAdmissao, $remuneracaoTotal, $capacidade, $ativo, $deletedAt, $excecao, $params['id']]);

        if ($mudouNivel) {
            $pdo->prepare('INSERT INTO colaboradornivelhistorico (id, colaboradorId, nivelTecnico, dataInicio) VALUES (?, ?, ?, NOW())')
                ->execute([Uuid::v4(), $params['id'], $nivelTecnico]);
        }
        if ($mudouRemuneracao) {
            Audit::registrar('ALTERAR_REMUNERACAO', 'Colaborador', $params['id'], ['de' => $existente['remuneracaoTotal'], 'para' => $remuneracaoTotal]);
        }
        $bodySemRemuneracao = $body;
        unset($bodySemRemuneracao['remuneracaoTotal']);
        Audit::registrar('ATUALIZAR', 'Colaborador', $params['id'], $bodySemRemuneracao);

        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE id = ?');
        $stmt->execute([$params['id']]);
        Http::json($stmt->fetch());
    }

    public static function delete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Colaborador não encontrado');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $pdo->prepare('UPDATE colaborador SET ativo=0, deletedAt=NOW() WHERE id=?')->execute([$params['id']]);
        Audit::registrar('EXCLUIR', 'Colaborador', $params['id']);
        Http::json(['ok' => true]);
    }

    public static function deleteDefinitivo(array $params): void
    {
        Auth::requireRole('DIRECAO');
        $pdo = Database::get();
        $id = $params['id'];
        $pdo->prepare('DELETE FROM colaboradornivelhistorico WHERE colaboradorId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM timesheetmensal WHERE colaboradorId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM carteirasnapshotmensal WHERE colaboradorId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM alocacao WHERE colaboradorId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM colaborador WHERE id = ?')->execute([$id]);
        Audit::registrar('EXCLUIR_DEFINITIVO', 'Colaborador', $id);
        Http::json(['ok' => true]);
    }

    public static function batchDelete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $ids = Http::required($body, 'ids');
        self::assertAcesso($ids);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::get()->prepare("UPDATE colaborador SET ativo=0, deletedAt=NOW() WHERE id IN ($ph)");
        $stmt->execute($ids);
        Audit::registrar('EXCLUIR_LOTE', 'Colaborador', null, ['ids' => $ids]);
        Http::json(['afetados' => $stmt->rowCount()]);
    }

    public static function batchToggleActive(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $ids = Http::required($body, 'ids');
        $ativo = Http::boolFromJson($body['ativo'] ?? false);
        self::assertAcesso($ids);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::get()->prepare("UPDATE colaborador SET ativo=?, deletedAt=? WHERE id IN ($ph)");
        $stmt->execute([$ativo ? 1 : 0, $ativo ? null : date('Y-m-d H:i:s'), ...$ids]);
        Audit::registrar($ativo ? 'ATIVAR_LOTE' : 'DESATIVAR_LOTE', 'Colaborador', null, ['ids' => $ids]);
        Http::json(['afetados' => $stmt->rowCount()]);
    }

    private static function assertAcesso(array $ids): void
    {
        $permitidos = Rbac::scopedNucleoIds();
        if ($permitidos === null || count($ids) === 0) {
            return;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::get()->prepare("SELECT nucleoId FROM colaborador WHERE id IN ($ph)");
        $stmt->execute($ids);
        $nucleoIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        if (count(array_diff($nucleoIds, $permitidos)) > 0) {
            throw new HttpException(403, 'Um ou mais colaboradores não pertencem ao seu núcleo');
        }
    }
}
