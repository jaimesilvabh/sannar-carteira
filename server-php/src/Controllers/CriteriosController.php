<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Uuid;

class CriteriosController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $permitidos = Rbac::scopedNucleoIds();
        $nucleoId = Http::query('nucleoId');
        if ($nucleoId) {
            Rbac::assertNucleoAccess($nucleoId);
            $stmt = Database::get()->prepare('SELECT * FROM criteriocliente WHERE nucleoId = ? ORDER BY nome ASC');
            $stmt->execute([$nucleoId]);
        } elseif ($permitidos !== null) {
            if (count($permitidos) === 0) {
                Http::json([]);
                return;
            }
            $placeholders = implode(',', array_fill(0, count($permitidos), '?'));
            $stmt = Database::get()->prepare("SELECT * FROM criteriocliente WHERE nucleoId IN ($placeholders) ORDER BY nome ASC");
            $stmt->execute($permitidos);
        } else {
            $stmt = Database::get()->query('SELECT * FROM criteriocliente ORDER BY nome ASC');
        }
        Http::json($stmt->fetchAll());
    }

    public static function create(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $nome = Http::required($body, 'nome');
        $peso = isset($body['peso']) ? (float) $body['peso'] : 1.0;

        $id = Uuid::v4();
        Database::get()->prepare('INSERT INTO criteriocliente (id, nucleoId, nome, descricao, peso, ativo) VALUES (?, ?, ?, ?, ?, 1)')
            ->execute([$id, $nucleoId, $nome, $body['descricao'] ?? null, $peso]);

        $criterio = self::find($id);
        Audit::registrar('CRIAR', 'CriterioCliente', $id, $criterio);
        Http::json($criterio, 201);
    }

    public static function update(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $existente = self::find($params['id']);
        if (!$existente) {
            throw new HttpException(404, 'Critério não encontrado');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $body = Http::body();

        $nome = $body['nome'] ?? $existente['nome'];
        $descricao = array_key_exists('descricao', $body) ? $body['descricao'] : $existente['descricao'];
        $peso = isset($body['peso']) ? (float) $body['peso'] : $existente['peso'];
        $ativo = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? 1 : 0) : $existente['ativo'];

        Database::get()->prepare('UPDATE criteriocliente SET nome=?, descricao=?, peso=?, ativo=? WHERE id=?')
            ->execute([$nome, $descricao, $peso, $ativo, $params['id']]);

        Audit::registrar('ATUALIZAR', 'CriterioCliente', $params['id'], $body);
        Http::json(self::find($params['id']));
    }

    public static function delete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $existente = self::find($params['id']);
        if (!$existente) {
            throw new HttpException(404, 'Critério não encontrado');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        Database::get()->prepare('UPDATE criteriocliente SET ativo = 0 WHERE id = ?')->execute([$params['id']]);
        Audit::registrar('EXCLUIR', 'CriterioCliente', $params['id']);
        Http::json(['ok' => true]);
    }

    public static function deleteDefinitivo(array $params): void
    {
        Auth::requireRole('DIRECAO');
        $existente = self::find($params['id']);
        if (!$existente) {
            throw new HttpException(404, 'Critério não encontrado');
        }
        $pdo = Database::get();
        $pdo->prepare('DELETE FROM pontuacaocriteriocliente WHERE criterioId = ?')->execute([$params['id']]);
        $pdo->prepare('DELETE FROM criteriocliente WHERE id = ?')->execute([$params['id']]);
        Audit::registrar('EXCLUIR_DEFINITIVO', 'CriterioCliente', $params['id']);
        Http::json(['ok' => true]);
    }

    public static function find(string $id): ?array
    {
        $stmt = Database::get()->prepare('SELECT * FROM criteriocliente WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}
