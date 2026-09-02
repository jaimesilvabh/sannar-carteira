<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Uuid;

class TiposClienteController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $permitidos = Rbac::scopedNucleoIds();
        $nucleoId = Http::query('nucleoId');
        if ($nucleoId) {
            Rbac::assertNucleoAccess($nucleoId);
            $stmt = Database::get()->prepare('SELECT * FROM tipocliente WHERE nucleoId = ? ORDER BY nome ASC');
            $stmt->execute([$nucleoId]);
        } elseif ($permitidos !== null) {
            if (count($permitidos) === 0) {
                Http::json([]);
                return;
            }
            $placeholders = implode(',', array_fill(0, count($permitidos), '?'));
            $stmt = Database::get()->prepare("SELECT * FROM tipocliente WHERE nucleoId IN ($placeholders) ORDER BY nome ASC");
            $stmt->execute($permitidos);
        } else {
            $stmt = Database::get()->query('SELECT * FROM tipocliente ORDER BY nome ASC');
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

        $stmt = Database::get()->prepare('SELECT id FROM tipocliente WHERE nucleoId = ? AND nome = ?');
        $stmt->execute([$nucleoId, $nome]);
        if ($stmt->fetchColumn()) {
            throw new HttpException(409, 'Já existe um tipo com esse nome neste núcleo');
        }

        $id = Uuid::v4();
        Database::get()->prepare('INSERT INTO tipocliente (id, nucleoId, nome, ativo) VALUES (?, ?, ?, 1)')
            ->execute([$id, $nucleoId, $nome]);
        Audit::registrar('CRIAR', 'TipoCliente', $id, ['nucleoId' => $nucleoId, 'nome' => $nome]);

        $stmt = Database::get()->prepare('SELECT * FROM tipocliente WHERE id = ?');
        $stmt->execute([$id]);
        Http::json($stmt->fetch(), 201);
    }

    public static function update(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $stmt = Database::get()->prepare('SELECT * FROM tipocliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Tipo não encontrado');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $body = Http::body();
        $nome = $body['nome'] ?? $existente['nome'];
        $ativo = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? 1 : 0) : $existente['ativo'];

        Database::get()->prepare('UPDATE tipocliente SET nome=?, ativo=? WHERE id=?')
            ->execute([$nome, $ativo, $params['id']]);
        Audit::registrar('ATUALIZAR', 'TipoCliente', $params['id'], $body);

        $stmt = Database::get()->prepare('SELECT * FROM tipocliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        Http::json($stmt->fetch());
    }
}
