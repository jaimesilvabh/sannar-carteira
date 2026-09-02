<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Uuid;

class FaixasClienteController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::required($_GET, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $stmt = Database::get()->prepare('SELECT * FROM faixanivelcliente WHERE nucleoId = ? ORDER BY pontuacaoMin ASC');
        $stmt->execute([$nucleoId]);
        Http::json($stmt->fetchAll());
    }

    public static function update(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $stmt = Database::get()->prepare('SELECT * FROM faixanivelcliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Faixa não encontrada');
        }
        Rbac::assertNucleoAccess($existente['nucleoId']);
        $body = Http::body();
        $min = isset($body['pontuacaoMin']) ? (float) $body['pontuacaoMin'] : $existente['pontuacaoMin'];
        $max = isset($body['pontuacaoMax']) ? (float) $body['pontuacaoMax'] : $existente['pontuacaoMax'];

        Database::get()->prepare('UPDATE faixanivelcliente SET pontuacaoMin=?, pontuacaoMax=? WHERE id=?')
            ->execute([$min, $max, $params['id']]);
        Audit::registrar('ATUALIZAR', 'FaixaNivelCliente', $params['id'], $body);

        $stmt = Database::get()->prepare('SELECT * FROM faixanivelcliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        Http::json($stmt->fetch());
    }

    /** Recalibra as 4 faixas a partir da soma dos pesos dos critérios ativos (nota média por critério). */
    public static function recalibrar(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT peso FROM criteriocliente WHERE nucleoId = ? AND ativo = 1');
        $stmt->execute([$nucleoId]);
        $pesos = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        $somaPesos = array_sum($pesos);
        if ($somaPesos <= 0) {
            throw new HttpException(400, 'Não há critérios ativos com peso neste núcleo para calibrar as faixas.');
        }

        $novasFaixas = [
            ['nivel' => 'N1', 'min' => 0, 'max' => $somaPesos * 2],
            ['nivel' => 'N2', 'min' => $somaPesos * 2, 'max' => $somaPesos * 3],
            ['nivel' => 'N3', 'min' => $somaPesos * 3, 'max' => $somaPesos * 4],
            ['nivel' => 'N4', 'min' => $somaPesos * 4, 'max' => $somaPesos * 5],
        ];

        foreach ($novasFaixas as $f) {
            $stmt = $pdo->prepare('SELECT id FROM faixanivelcliente WHERE nucleoId = ? AND nivel = ?');
            $stmt->execute([$nucleoId, $f['nivel']]);
            $id = $stmt->fetchColumn();
            if ($id) {
                $pdo->prepare('UPDATE faixanivelcliente SET pontuacaoMin=?, pontuacaoMax=? WHERE id=?')
                    ->execute([$f['min'], $f['max'], $id]);
            } else {
                $pdo->prepare('INSERT INTO faixanivelcliente (id, nucleoId, nivel, pontuacaoMin, pontuacaoMax) VALUES (?, ?, ?, ?, ?)')
                    ->execute([Uuid::v4(), $nucleoId, $f['nivel'], $f['min'], $f['max']]);
            }
        }

        Audit::registrar('RECALIBRAR_FAIXAS', 'FaixaNivelCliente', null, ['nucleoId' => $nucleoId, 'somaPesos' => $somaPesos]);
        Http::json(['somaPesos' => $somaPesos, 'faixas' => $novasFaixas]);
    }
}
