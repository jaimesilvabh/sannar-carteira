<?php

namespace Sannar\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Sannar\Database;

class ExcelExport
{
    private const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    /** Recria o formato original da planilha (uma aba por colaborador + DOMESTICAS) a partir do banco. */
    public static function exportarPlanilhaPessoal(string $nucleoId, int $ano): string
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId = ? AND ativo = 1 ORDER BY nome ASC');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT ct.clienteId, tc.nome FROM clientetipo ct INNER JOIN tipocliente tc ON tc.id=ct.tipoClienteId WHERE ct.nucleoId = ?');
        $stmt->execute([$nucleoId]);
        $tiposPorCliente = [];
        foreach ($stmt->fetchAll() as $row) { $tiposPorCliente[$row['clienteId']][] = $row['nome']; }
        $ehDomestica = fn($clienteId) => in_array(true, array_map(fn($n) => str_contains(mb_strtolower($n), 'domestic'), $tiposPorCliente[$clienteId] ?? []), true);

        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);
        $sheetIndex = 0;

        foreach ($colaboradores as $colaborador) {
            $stmt = $pdo->prepare('SELECT a.*, c.nome AS clienteNome, c.nivelOriginalTexto, c.contato FROM alocacao a INNER JOIN cliente c ON c.id=a.clienteId WHERE a.colaboradorId=? AND a.nucleoId=? AND a.dataFim IS NULL');
            $stmt->execute([$colaborador['id'], $nucleoId]);
            $alocacoes = array_values(array_filter($stmt->fetchAll(), fn($a) => !$ehDomestica($a['clienteId'])));
            if (count($alocacoes) === 0) continue;

            $header = ['Nº', 'Nome do Cliente', 'Níveis das empresas', 'Tipo', 'Responsaveis pelas empresas', 'Nome Cliente - Contato'];
            foreach (self::NOMES_MESES as $nomeMes) {
                $sufixo = "{$nomeMes}/" . substr((string) $ano, -2);
                array_push($header, "Nº Empregados {$sufixo}", "Nº Sócios {$sufixo}", "Nº Autonomo {$sufixo}", "Nº Estagiario {$sufixo}");
            }

            $sheet = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet($spreadsheet, self::nomeAbaSeguro($colaborador['nome'], $sheetIndex++));
            $spreadsheet->addSheet($sheet);
            $sheet->fromArray($header, null, 'A1');

            $linha = 2;
            $n = 1;
            foreach ($alocacoes as $a) {
                $stmt2 = $pdo->prepare('SELECT * FROM volumemensalcliente WHERE clienteId=? AND ano=?');
                $stmt2->execute([$a['clienteId'], $ano]);
                $volPorMes = [];
                foreach ($stmt2->fetchAll() as $v) { $volPorMes[(int) $v['mes']] = $v; }

                $tipos = implode('/', $tiposPorCliente[$a['clienteId']] ?? []);
                $row = [$n++, $a['clienteNome'], $a['nivelOriginalTexto'] ?? '', $tipos, $colaborador['nome'], $a['contato'] ?? ''];
                for ($m = 1; $m <= 12; $m++) {
                    $v = $volPorMes[$m] ?? null;
                    array_push($row, $v['nEmpregados'] ?? null, $v['nSocios'] ?? null, $v['nAutonomos'] ?? null, $v['nEstagiarios'] ?? null);
                }
                $sheet->fromArray($row, null, "A{$linha}");
                $linha++;
            }
        }

        $stmt = $pdo->prepare('SELECT cn.clienteId, c.nome, c.observacoesHistorico FROM clientenucleo cn INNER JOIN cliente c ON c.id=cn.clienteId WHERE cn.nucleoId = ?');
        $stmt->execute([$nucleoId]);
        $domesticos = array_values(array_filter($stmt->fetchAll(), fn($v) => $ehDomestica($v['clienteId'])));
        if (count($domesticos) > 0) {
            $sheet = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet($spreadsheet, 'DOMESTICAS');
            $spreadsheet->addSheet($sheet);
            $sheet->fromArray(['Nº', 'CLIENTE', 'observações'], null, 'A2');
            $linha = 3;
            foreach ($domesticos as $i => $v) {
                $sheet->fromArray([$i + 1, $v['nome'], $v['observacoesHistorico'] ?? ''], null, "A{$linha}");
                $linha++;
            }
        }

        if ($spreadsheet->getSheetCount() === 0) {
            $sheet = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet($spreadsheet, 'Vazio');
            $spreadsheet->addSheet($sheet);
            $sheet->fromArray(['Sem dados para exportar'], null, 'A1');
        }

        $tmp = tempnam(sys_get_temp_dir(), 'sannar_export_') . '.xlsx';
        (new Xlsx($spreadsheet))->save($tmp);
        return $tmp;
    }

    private static function nomeAbaSeguro(string $nome, int $indice): string
    {
        $limpo = substr(preg_replace('/[\\\\\/\?\*\[\]:]/', '', $nome), 0, 31);
        return $limpo !== '' ? $limpo : "Aba{$indice}";
    }
}
