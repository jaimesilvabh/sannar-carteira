<?php

require __DIR__ . '/vendor/autoload.php';

use Sannar\Auth;
use Sannar\Database;
use Sannar\Uuid;

$pdo = Database::get();

$nomesNucleos = ['Fiscal', 'Contábil', 'Pessoal', 'Societário', 'Comercial', 'Comunicação/Adm-financeiro'];

$criteriosPorNucleo = [
    'Pessoal' => [
        'Nº de funcionários ativos',
        'Nº de convenções coletivas/sindicatos distintos',
        'Rotatividade (admissões/demissões por mês)',
        'Diversidade de benefícios (VR/VT, plano de saúde, PLR, flexíveis)',
        'Cargos comissionados/variáveis/horas extras',
        'Processos trabalhistas ativos',
        'Terceirizados/PJs junto com CLT',
        'Múltiplos estabelecimentos com FAP/RAT diferentes',
    ],
    'Fiscal' => [
        'Regime tributário (MEI/Simples/Presumido/Real)',
        'Nº de estabelecimentos/filiais e UFs',
        'Volume de notas fiscais/mês',
        'Créditos tributários / não-cumulatividade',
        'Comércio exterior',
        'Obrigações acessórias específicas (ECF, Bloco K, EFD-Contribuições, e-Financeira)',
        'Histórico de malha fina/autuações/parcelamentos',
        'Necessidade de planejamento tributário ativo',
    ],
    'Contábil' => [
        'Volume de lançamentos/mês',
        'Consolidação (grupo econômico)',
        'Auditoria externa',
        'Complexidade de demonstrações societárias (DFC, DVA, notas explicativas)',
        'Ativo imobilizado relevante',
        'Frequência de operações societárias (fusão, cisão, incorporação, aumento de capital)',
        'Multiplicidade de contas bancárias/moedas',
        'Relatórios gerenciais customizados',
    ],
];

$faixasDefault = [
    ['nivel' => 'N1', 'min' => 0, 'max' => 14],
    ['nivel' => 'N2', 'min' => 15, 'max' => 22],
    ['nivel' => 'N3', 'min' => 23, 'max' => 30],
    ['nivel' => 'N4', 'min' => 31, 'max' => 999],
];

$niveisTecnicosDesc = [
    'T1' => 'Em formação — executa tarefas rotineiras sob supervisão direta.',
    'T2' => 'Analista — autonomia em clientes de complexidade baixa/média.',
    'T3' => 'Sênior — autonomia em clientes complexos, revisa trabalho de T1/T2.',
    'T4' => 'Especialista — referência técnica, atende os clientes mais críticos e estratégicos.',
];

$regraDefault = [['T1', 'N1'], ['T2', 'N2'], ['T3', 'N3'], ['T4', 'N4']];

$nucleoIdPorNome = [];
foreach ($nomesNucleos as $nome) {
    $stmt = $pdo->prepare('SELECT id FROM nucleo WHERE nome = ?');
    $stmt->execute([$nome]);
    $existente = $stmt->fetchColumn();
    if ($existente) {
        $nucleoIdPorNome[$nome] = $existente;
        continue;
    }
    $id = Uuid::v4();
    $pdo->prepare('INSERT INTO nucleo (id, nome) VALUES (?, ?)')->execute([$id, $nome]);
    $nucleoIdPorNome[$nome] = $id;
}

foreach ($criteriosPorNucleo as $nomeNucleo => $criterios) {
    $nucleoId = $nucleoIdPorNome[$nomeNucleo];
    foreach ($criterios as $nomeCriterio) {
        $stmt = $pdo->prepare('SELECT id FROM criteriocliente WHERE nucleoId = ? AND nome = ?');
        $stmt->execute([$nucleoId, $nomeCriterio]);
        if (!$stmt->fetchColumn()) {
            $pdo->prepare('INSERT INTO criteriocliente (id, nucleoId, nome, peso, ativo) VALUES (?, ?, ?, 1, 1)')
                ->execute([Uuid::v4(), $nucleoId, $nomeCriterio]);
        }
    }
}

foreach ($nucleoIdPorNome as $nucleoId) {
    foreach ($faixasDefault as $f) {
        $stmt = $pdo->prepare('SELECT id FROM faixanivelcliente WHERE nucleoId = ? AND nivel = ?');
        $stmt->execute([$nucleoId, $f['nivel']]);
        if (!$stmt->fetchColumn()) {
            $pdo->prepare('INSERT INTO faixanivelcliente (id, nucleoId, nivel, pontuacaoMin, pontuacaoMax) VALUES (?, ?, ?, ?, ?)')
                ->execute([Uuid::v4(), $nucleoId, $f['nivel'], $f['min'], $f['max']]);
        }
    }
    foreach ($niveisTecnicosDesc as $nivel => $descricao) {
        $stmt = $pdo->prepare('SELECT id FROM faixanivelcolaborador WHERE nucleoId = ? AND nivel = ?');
        $stmt->execute([$nucleoId, $nivel]);
        if (!$stmt->fetchColumn()) {
            $pdo->prepare('INSERT INTO faixanivelcolaborador (id, nucleoId, nivel, descricaoCompetencias) VALUES (?, ?, ?, ?)')
                ->execute([Uuid::v4(), $nucleoId, $nivel, $descricao]);
        }
    }
    foreach ($regraDefault as [$nivelTecnico, $nivelClienteMaximo]) {
        $stmt = $pdo->prepare('SELECT id FROM regracorrespondencia WHERE nucleoId = ? AND nivelTecnico = ?');
        $stmt->execute([$nucleoId, $nivelTecnico]);
        if (!$stmt->fetchColumn()) {
            $pdo->prepare('INSERT INTO regracorrespondencia (id, nucleoId, nivelTecnico, nivelClienteMaximo) VALUES (?, ?, ?, ?)')
                ->execute([Uuid::v4(), $nucleoId, $nivelTecnico, $nivelClienteMaximo]);
        }
    }
}

$emailDirecao = 'jaimesilvabh@gmail.com';
$stmt = $pdo->prepare('SELECT id FROM user WHERE email = ?');
$stmt->execute([$emailDirecao]);
if (!$stmt->fetchColumn()) {
    $senha = bin2hex(random_bytes(6));
    $hash = Auth::hashPassword($senha);
    $pdo->prepare('INSERT INTO user (id, email, passwordHash, nome, role, nucleoId, ativo) VALUES (?, ?, ?, ?, ?, NULL, 1)')
        ->execute([Uuid::v4(), $emailDirecao, $hash, 'Direção', 'DIRECAO']);
    echo "=========================================================\n";
    echo "Usuário Direção criado:\n";
    echo "  e-mail: {$emailDirecao}\n";
    echo "  senha temporária: {$senha}\n";
    echo "=========================================================\n";
} else {
    echo "Usuário Direção já existe, seed de usuário ignorado.\n";
}

echo "Seed concluído.\n";
