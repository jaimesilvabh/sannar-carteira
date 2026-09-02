<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\Rbac;
use Sannar\Services\Scoring;
use Sannar\Uuid;

class SnapshotsController
{
    public static function recalcular(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $mes = (int) Http::required($body, 'mes');
        $ano = (int) Http::required($body, 'ano');

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId = ? AND ativo = 1');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $gravados = 0;
        foreach ($colaboradores as $colaborador) {
            $stmt = $pdo->prepare('SELECT clienteId FROM alocacao WHERE colaboradorId=? AND nucleoId=? AND dataFim IS NULL');
            $stmt->execute([$colaborador['id'], $nucleoId]);
            $clienteIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId);
            $pontuacaoTotal = array_sum(array_map(fn($p) => $p['pontuacaoTotal'], $pontuacoes));

            $stmt = $pdo->prepare('SELECT id FROM carteirasnapshotmensal WHERE colaboradorId=? AND mes=? AND ano=?');
            $stmt->execute([$colaborador['id'], $mes, $ano]);
            $id = $stmt->fetchColumn();
            if ($id) {
                $pdo->prepare('UPDATE carteirasnapshotmensal SET pontuacaoTotal=?, nClientes=? WHERE id=?')
                    ->execute([$pontuacaoTotal, count($clienteIds), $id]);
            } else {
                $pdo->prepare('INSERT INTO carteirasnapshotmensal (id, colaboradorId, mes, ano, pontuacaoTotal, nClientes, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())')
                    ->execute([Uuid::v4(), $colaborador['id'], $mes, $ano, $pontuacaoTotal, count($clienteIds)]);
            }
            $gravados++;
        }

        Audit::registrar('RECALCULAR_SNAPSHOT', 'CarteiraSnapshotMensal', null, ['nucleoId' => $nucleoId, 'mes' => $mes, 'ano' => $ano, 'gravados' => $gravados]);
        Http::json(['gravados' => $gravados]);
    }
}
