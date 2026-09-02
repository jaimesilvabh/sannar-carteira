<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\Rbac;

class EficienciaController
{
    private static function heatmap12(array $registros): array
    {
        $out = [];
        for ($m = 1; $m <= 12; $m++) {
            $t = null;
            foreach ($registros as $r) { if ((int) $r['mes'] === $m) { $t = $r; break; } }
            $out[] = ['mes' => $m, 'eficiencia' => $t ? (float) $t['eficiencia'] : null];
        }
        return $out;
    }

    public static function colaboradores(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::required($_GET, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId=? AND ativo=1 ORDER BY nome ASC');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $resultado = [];
        foreach ($colaboradores as $c) {
            $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE colaboradorId=? AND ano=? AND ativo=1');
            $stmt->execute([$c['id'], $ano]);
            $resultado[] = ['colaboradorId' => $c['id'], 'nome' => $c['nome'], 'heatmap' => self::heatmap12($stmt->fetchAll())];
        }
        Http::json($resultado);
    }

    public static function nucleos(array $params): void
    {
        Auth::requireAuth();
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');
        $permitidos = Rbac::scopedNucleoIds();

        $pdo = Database::get();
        if ($permitidos !== null) {
            if (count($permitidos) === 0) { Http::json([]); return; }
            $ph = implode(',', array_fill(0, count($permitidos), '?'));
            $stmt = $pdo->prepare("SELECT * FROM nucleo WHERE id IN ($ph)");
            $stmt->execute($permitidos);
        } else {
            $stmt = $pdo->query('SELECT * FROM nucleo');
        }
        $nucleos = $stmt->fetchAll();

        $resultado = [];
        foreach ($nucleos as $nucleo) {
            $stmt = $pdo->prepare('SELECT id FROM colaborador WHERE nucleoId=? AND ativo=1');
            $stmt->execute([$nucleo['id']]);
            $colaboradorIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $registros = [];
            if (count($colaboradorIds) > 0) {
                $ph = implode(',', array_fill(0, count($colaboradorIds), '?'));
                $stmt = $pdo->prepare("SELECT * FROM timesheetmensal WHERE colaboradorId IN ($ph) AND ano=? AND ativo=1");
                $stmt->execute([...$colaboradorIds, $ano]);
                $registros = $stmt->fetchAll();
            }
            $heatmap = [];
            for ($m = 1; $m <= 12; $m++) {
                $doMes = array_values(array_map(fn($r) => (float) $r['eficiencia'], array_filter($registros, fn($r) => (int) $r['mes'] === $m)));
                $heatmap[] = ['mes' => $m, 'eficiencia' => count($doMes) > 0 ? array_sum($doMes) / count($doMes) : null];
            }
            $resultado[] = ['nucleoId' => $nucleo['id'], 'nome' => $nucleo['nome'], 'heatmap' => $heatmap];
        }
        Http::json($resultado);
    }

    public static function empresa(array $params): void
    {
        Auth::requireRole('DIRECAO');
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');
        $stmt = Database::get()->prepare('SELECT * FROM timesheetmensal WHERE ano=? AND ativo=1');
        $stmt->execute([$ano]);
        $registros = $stmt->fetchAll();

        $heatmap = [];
        for ($m = 1; $m <= 12; $m++) {
            $doMes = array_values(array_map(fn($r) => (float) $r['eficiencia'], array_filter($registros, fn($r) => (int) $r['mes'] === $m)));
            $heatmap[] = ['mes' => $m, 'eficiencia' => count($doMes) > 0 ? array_sum($doMes) / count($doMes) : null];
        }
        Http::json(['heatmap' => $heatmap]);
    }
}
