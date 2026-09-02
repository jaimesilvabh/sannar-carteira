<?php

namespace Sannar\Services;

use Sannar\Database;

/**
 * Calcula pontuação e nível de clientes num núcleo, em lote (evita N+1). Por critério, usa a
 * pontuação de mesReferencia se informado e existir; senão cai para o lançamento mais recente
 * (modo "estático" — vale até nova reavaliação, seção 3.5 do prompt original).
 */
class Scoring
{
    /** @return array<string, array{clienteId:string, pontuacaoTotal:float, nivel:?string, avaliado:bool, detalhePorCriterio:array}> */
    public static function calcularPontuacoesClientes(array $clienteIds, string $nucleoId, ?string $mesReferencia = null): array
    {
        $resultado = [];
        if (count($clienteIds) === 0) {
            return $resultado;
        }
        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT * FROM criteriocliente WHERE nucleoId = ? AND ativo = 1');
        $stmt->execute([$nucleoId]);
        $criterios = $stmt->fetchAll();

        $placeholders = implode(',', array_fill(0, count($clienteIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM pontuacaocriteriocliente WHERE clienteId IN ($placeholders) AND nucleoId = ? ORDER BY createdAt DESC");
        $stmt->execute([...$clienteIds, $nucleoId]);
        $pontuacoes = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT * FROM faixanivelcliente WHERE nucleoId = ? ORDER BY pontuacaoMin ASC');
        $stmt->execute([$nucleoId]);
        $faixas = $stmt->fetchAll();

        $porClienteCriterio = [];
        foreach ($pontuacoes as $p) {
            $key = $p['clienteId'] . '|' . $p['criterioId'];
            $porClienteCriterio[$key][] = $p;
        }

        foreach ($clienteIds as $clienteId) {
            $total = 0.0;
            $algumAvaliado = false;
            $detalhe = [];

            foreach ($criterios as $criterio) {
                $registros = $porClienteCriterio[$clienteId . '|' . $criterio['id']] ?? [];
                $valor = null;
                if ($mesReferencia !== null) {
                    foreach ($registros as $r) {
                        if ($r['mesReferencia'] === $mesReferencia) {
                            $valor = (int) $r['valor'];
                            break;
                        }
                    }
                }
                if ($valor === null && count($registros) > 0) {
                    $valor = (int) $registros[0]['valor'];
                }
                if ($valor !== null) {
                    $algumAvaliado = true;
                    $total += $valor * (float) $criterio['peso'];
                }
                $detalhe[] = ['criterioId' => $criterio['id'], 'nome' => $criterio['nome'], 'peso' => (float) $criterio['peso'], 'valor' => $valor];
            }

            $resultado[$clienteId] = [
                'clienteId' => $clienteId,
                'pontuacaoTotal' => $total,
                'nivel' => $algumAvaliado ? self::nivelParaPontuacao($total, $faixas) : null,
                'avaliado' => $algumAvaliado,
                'detalhePorCriterio' => $detalhe,
            ];
        }

        return $resultado;
    }

    public static function calcularPontuacaoCliente(string $clienteId, string $nucleoId, ?string $mesReferencia = null): array
    {
        $mapa = self::calcularPontuacoesClientes([$clienteId], $nucleoId, $mesReferencia);
        return $mapa[$clienteId] ?? [
            'clienteId' => $clienteId, 'pontuacaoTotal' => 0, 'nivel' => null, 'avaliado' => false, 'detalhePorCriterio' => [],
        ];
    }

    private static function nivelParaPontuacao(float $total, array $faixas): ?string
    {
        if (count($faixas) === 0) {
            return null;
        }
        foreach ($faixas as $f) {
            if ($total >= (float) $f['pontuacaoMin'] && $total <= (float) $f['pontuacaoMax']) {
                return $f['nivel'];
            }
        }
        $menor = $faixas[0];
        $maior = $faixas[count($faixas) - 1];
        return $total < (float) $menor['pontuacaoMin'] ? $menor['nivel'] : $maior['nivel'];
    }
}
