<?php

namespace Sannar\Services;

use TCPDF;

class PdfHelpers
{
    private const MARGEM = 15;
    private const LARGURA_UTIL = 180; // A4 (210mm) - 2*15mm de margem
    private const ALTURA_CABECALHO_TABELA = 7;
    private const ALTURA_MIN_LINHA = 6;
    private const PADDING = 1.5;

    public static function novoDocumento(string $titulo): TCPDF
    {
        $pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8', false);
        $pdf->SetCreator('Sannar Carteira');
        $pdf->SetTitle($titulo);
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->SetMargins(self::MARGEM, self::MARGEM, self::MARGEM);
        $pdf->SetAutoPageBreak(true, self::MARGEM);
        $pdf->AddPage();
        $pdf->SetFont('helvetica', '', 9);
        return $pdf;
    }

    public static function cabecalho(TCPDF $pdf, string $titulo, ?string $subtitulo = null): void
    {
        $pdf->SetTextColor(0x15, 0x2b, 0x6f);
        $pdf->SetFont('helvetica', 'B', 16);
        $pdf->Cell(0, 8, 'Sannar Contabilidade', 0, 1);

        $pdf->SetTextColor(0x1a, 0x1a, 0x1a);
        $pdf->SetFont('helvetica', 'B', 12);
        $pdf->Cell(0, 6, $titulo, 0, 1);

        if ($subtitulo) {
            $pdf->SetTextColor(0x66, 0x66, 0x66);
            $pdf->SetFont('helvetica', '', 9);
            $pdf->Cell(0, 5, $subtitulo, 0, 1);
        }

        $pdf->SetTextColor(0x99, 0x99, 0x99);
        $pdf->SetFont('helvetica', '', 7);
        $pdf->Cell(0, 4, 'Gerado em ' . date('d/m/Y, H:i:s'), 0, 1);

        $pdf->Ln(1);
        $pdf->SetDrawColor(0xdd, 0xdd, 0xdd);
        $y = $pdf->GetY();
        $pdf->Line(self::MARGEM, $y, self::MARGEM + self::LARGURA_UTIL, $y);
        $pdf->Ln(3);
        $pdf->SetTextColor(0x1a, 0x1a, 0x1a);
    }

    public static function tituloSecao(TCPDF $pdf, string $texto): void
    {
        if ($pdf->GetY() > 260) {
            $pdf->AddPage();
        }
        $pdf->Ln(2);
        $pdf->SetTextColor(0x15, 0x2b, 0x6f);
        $pdf->SetFont('helvetica', 'B', 11);
        $pdf->Cell(0, 6, $texto, 0, 1);
        $pdf->SetTextColor(0x1a, 0x1a, 0x1a);
        $pdf->SetFont('helvetica', '', 9);
        $pdf->Ln(1);
    }

    /** @param array<array{0:string,1:string}> $pares */
    public static function kpiLinha(TCPDF $pdf, array $pares): void
    {
        $pdf->SetFont('helvetica', '', 9);
        foreach ($pares as [$label, $valor]) {
            $pdf->SetTextColor(0x66, 0x66, 0x66);
            $pdf->Write(5, $label . ' ');
            $pdf->SetTextColor(0x1a, 0x1a, 0x1a);
            $pdf->SetFont('helvetica', 'B', 9);
            $pdf->Write(5, $valor);
            $pdf->SetFont('helvetica', '', 9);
            $pdf->Ln(5);
        }
        $pdf->Ln(2);
    }

    /**
     * Tabela simples: colunas com {titulo, largura, quebraLinha} + linhas de texto. Cada linha nunca
     * é dividida entre páginas — se não couber, começa uma nova página com o cabeçalho repetido.
     * @param array<array{titulo:string,largura:float,quebraLinha?:bool}> $colunas
     * @param array<array<string>> $linhas
     */
    public static function tabela(TCPDF $pdf, array $colunas, array $linhas): void
    {
        $inicioX = self::MARGEM;
        $larguraTotal = array_sum(array_column($colunas, 'largura'));

        $desenharCabecalho = function () use ($pdf, $colunas, $inicioX, $larguraTotal) {
            $y = $pdf->GetY();
            $pdf->SetFillColor(0x2f, 0x6b, 0xff);
            $pdf->SetTextColor(0xff, 0xff, 0xff);
            $pdf->SetFont('helvetica', 'B', 8.5);
            $x = $inicioX;
            foreach ($colunas as $col) {
                $pdf->SetXY($x, $y);
                $pdf->Cell($col['largura'], self::ALTURA_CABECALHO_TABELA, $col['titulo'], 0, 0, 'L', true);
                $x += $col['largura'];
            }
            $pdf->SetXY($inicioX, $y + self::ALTURA_CABECALHO_TABELA);
            $pdf->SetTextColor(0x1a, 0x1a, 0x1a);
            $pdf->SetFont('helvetica', '', 8);
        };

        $desenharCabecalho();

        $indice = 0;
        foreach ($linhas as $linha) {
            $alturas = [self::ALTURA_MIN_LINHA];
            foreach ($colunas as $i => $col) {
                if (($col['quebraLinha'] ?? true) === false) continue;
                $texto = $linha[$i] ?? '';
                $alturas[] = $pdf->getStringHeight($col['largura'] - self::PADDING * 2, $texto) + self::PADDING;
            }
            $alturaLinha = max($alturas);

            if ($pdf->GetY() + $alturaLinha > 297 - self::MARGEM) {
                $pdf->AddPage();
                $desenharCabecalho();
            }

            $y = $pdf->GetY();
            if ($indice % 2 === 1) {
                $pdf->SetFillColor(0xf1, 0xf5, 0xf9);
                $pdf->Rect($inicioX, $y, $larguraTotal, $alturaLinha, 'F');
            }

            $x = $inicioX;
            foreach ($colunas as $i => $col) {
                $texto = $linha[$i] ?? '';
                if (($col['quebraLinha'] ?? true) === false) {
                    $pdf->SetXY($x, $y);
                    $pdf->Cell($col['largura'], $alturaLinha, self::truncar($pdf, $texto, $col['largura'] - self::PADDING * 2), 0, 0, 'L');
                } else {
                    $pdf->SetXY($x, $y);
                    $pdf->MultiCell($col['largura'], $alturaLinha, $texto, 0, 'L', false, 0);
                }
                $x += $col['largura'];
            }
            $pdf->SetXY($inicioX, $y + $alturaLinha);
            $indice++;
        }
        $pdf->Ln(3);
    }

    private static function truncar(TCPDF $pdf, string $texto, float $larguraDisponivel): string
    {
        if ($pdf->GetStringWidth($texto) <= $larguraDisponivel) {
            return $texto;
        }
        while (mb_strlen($texto) > 1 && $pdf->GetStringWidth($texto . '…') > $larguraDisponivel) {
            $texto = mb_substr($texto, 0, -1);
        }
        return $texto . '…';
    }
}
