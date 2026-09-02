<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\ExcelImport;

class ImportController
{
    public static function pessoal(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        if (!isset($_FILES['arquivo']) || $_FILES['arquivo']['error'] !== UPLOAD_ERR_OK) {
            throw new HttpException(400, "Nenhum arquivo enviado (campo 'arquivo').");
        }

        $stmt = Database::get()->prepare('SELECT id FROM nucleo WHERE nome = ?');
        $stmt->execute(['Pessoal']);
        $nucleoPessoalId = $stmt->fetchColumn();
        if (!$nucleoPessoalId) {
            throw new HttpException(500, 'Núcleo Pessoal não encontrado — rode o seed do banco.');
        }
        Rbac::assertNucleoAccess($nucleoPessoalId);

        $relatorio = ExcelImport::importarPlanilhaPessoal($_FILES['arquivo']['tmp_name'], $nucleoPessoalId);
        Audit::registrar('IMPORTAR', 'Cliente', null, array_merge(['arquivo' => $_FILES['arquivo']['name']], $relatorio));
        Http::json($relatorio);
    }
}
