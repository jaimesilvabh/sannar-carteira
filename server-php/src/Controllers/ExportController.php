<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\ExcelExport;

class ExportController
{
    public static function pessoal(array $params): void
    {
        Auth::requireAuth();
        $stmt = Database::get()->prepare('SELECT id FROM nucleo WHERE nome = ?');
        $stmt->execute(['Pessoal']);
        $nucleoPessoalId = $stmt->fetchColumn();
        if (!$nucleoPessoalId) {
            throw new HttpException(500, 'Núcleo Pessoal não encontrado — rode o seed do banco.');
        }
        Rbac::assertNucleoAccess($nucleoPessoalId);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');

        $caminho = ExcelExport::exportarPlanilhaPessoal($nucleoPessoalId, $ano);
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header("Content-Disposition: attachment; filename=\"carteira-pessoal-{$ano}.xlsx\"");
        readfile($caminho);
        unlink($caminho);
    }
}
