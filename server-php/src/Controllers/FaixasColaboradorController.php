<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;

class FaixasColaboradorController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::required($_GET, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $stmt = Database::get()->prepare('SELECT * FROM faixanivelcolaborador WHERE nucleoId = ? ORDER BY nivel ASC');
        $stmt->execute([$nucleoId]);
        Http::json($stmt->fetchAll());
    }

    public static function update(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $stmt = Database::get()->prepare('SELECT * FROM faixanivelcolaborador WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Faixa não encontrada');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $body = Http::body();
        $descricao = $body['descricaoCompetencias'] ?? $existente['descricaoCompetencias'];

        Database::get()->prepare('UPDATE faixanivelcolaborador SET descricaoCompetencias=? WHERE id=?')
            ->execute([$descricao, $params['id']]);
        Audit::registrar('ATUALIZAR', 'FaixaNivelColaborador', $params['id'], $body);

        $stmt = Database::get()->prepare('SELECT * FROM faixanivelcolaborador WHERE id = ?');
        $stmt->execute([$params['id']]);
        Http::json($stmt->fetch());
    }

    public static function listRegras(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::required($_GET, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $stmt = Database::get()->prepare('SELECT * FROM regracorrespondencia WHERE nucleoId = ? ORDER BY nivelTecnico ASC');
        $stmt->execute([$nucleoId]);
        Http::json($stmt->fetchAll());
    }

    public static function updateRegra(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $stmt = Database::get()->prepare('SELECT * FROM regracorrespondencia WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Regra não encontrada');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $body = Http::body();
        $nivelClienteMaximo = Http::required($body, 'nivelClienteMaximo');

        Database::get()->prepare('UPDATE regracorrespondencia SET nivelClienteMaximo=? WHERE id=?')
            ->execute([$nivelClienteMaximo, $params['id']]);
        Audit::registrar('ATUALIZAR', 'RegraCorrespondencia', $params['id'], $body);

        $stmt = Database::get()->prepare('SELECT * FROM regracorrespondencia WHERE id = ?');
        $stmt->execute([$params['id']]);
        Http::json($stmt->fetch());
    }
}
