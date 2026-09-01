import PDFDocument from "pdfkit";

export function novoDocumento(titulo: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  doc.info.Title = titulo;
  return doc;
}

export function cabecalho(doc: PDFKit.PDFDocument, titulo: string, subtitulo?: string) {
  doc.x = doc.page.margins.left;
  doc.fontSize(18).fillColor("#152b6f").text("Sannar Contabilidade", { continued: false });
  doc.fontSize(14).fillColor("#1a1a1a").text(titulo);
  if (subtitulo) doc.fontSize(10).fillColor("#666666").text(subtitulo);
  doc.fontSize(8).fillColor("#999999").text(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
  doc.moveDown(1);
  const direita = doc.page.width - doc.page.margins.right;
  doc.strokeColor("#dddddd").moveTo(doc.page.margins.left, doc.y).lineTo(direita, doc.y).stroke();
  doc.moveDown(0.7);
  doc.fillColor("#1a1a1a");
  doc.x = doc.page.margins.left;
}

export function tituloSecao(doc: PDFKit.PDFDocument, texto: string) {
  doc.x = doc.page.margins.left;
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor("#152b6f").text(texto);
  doc.fillColor("#1a1a1a");
  doc.moveDown(0.3);
  doc.x = doc.page.margins.left;
}

export function kpiLinha(doc: PDFKit.PDFDocument, pares: [string, string][]) {
  doc.x = doc.page.margins.left;
  doc.fontSize(9);
  for (const [label, valor] of pares) {
    doc.x = doc.page.margins.left;
    doc.fillColor("#666666").text(label, { continued: true }).fillColor("#1a1a1a").text(`  ${valor}`);
  }
  doc.moveDown(0.5);
  doc.x = doc.page.margins.left;
}

const ALTURA_MIN_LINHA = 16;
const ALTURA_CABECALHO = 20;
const RODAPE_PAGINA = 780;
const PADDING_CELULA = 4;

/** Tabela simples: larguras em pontos, cabeçalho + linhas de texto. Altura de linha dinâmica (quebra de texto) e paginação automática. */
export function tabela(doc: PDFKit.PDFDocument, colunas: { titulo: string; largura: number; quebraLinha?: boolean }[], linhas: string[][]) {
  // Sempre ancorada na margem esquerda real da página — chamadas anteriores de texto com
  // coordenadas explícitas (células da tabela, kpiLinha) deixam doc.x "à deriva", então nunca
  // confie em doc.x aqui para não desalinhar/cortar a tabela seguinte.
  const inicioX = doc.page.margins.left;
  doc.x = inicioX;
  const larguraTotal = colunas.reduce((s, c) => s + c.largura, 0);

  function cabecalhoTabela() {
    const y = doc.y;
    doc.rect(inicioX, y, larguraTotal, ALTURA_CABECALHO).fill("#2f6bff");
    doc.fontSize(9).fillColor("#ffffff");
    let x = inicioX;
    for (const col of colunas) {
      doc.text(col.titulo, x + PADDING_CELULA, y + 6, { width: col.largura - PADDING_CELULA * 2, ellipsis: true });
      x += col.largura;
    }
    doc.y = y + ALTURA_CABECALHO;
    doc.fillColor("#1a1a1a");
  }

  cabecalhoTabela();

  doc.fontSize(8.5);
  let linhaIndex = 0;
  for (const linha of linhas) {
    const alturas = colunas.map((col, i) => {
      const texto = linha[i] ?? "";
      if (col.quebraLinha === false) return ALTURA_MIN_LINHA;
      return doc.heightOfString(texto, { width: col.largura - PADDING_CELULA * 2 }) + PADDING_CELULA * 2;
    });
    const alturaLinha = Math.max(ALTURA_MIN_LINHA, ...alturas);

    if (doc.y + alturaLinha > RODAPE_PAGINA) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      cabecalhoTabela();
      doc.fontSize(8.5);
    }

    const y = doc.y;
    if (linhaIndex % 2 === 1) {
      doc.rect(inicioX, y, larguraTotal, alturaLinha).fill("#f1f5f9");
    }
    doc.fillColor("#1a1a1a");
    let x = inicioX;
    for (let i = 0; i < colunas.length; i++) {
      doc.text(linha[i] ?? "", x + PADDING_CELULA, y + PADDING_CELULA, {
        width: colunas[i].largura - PADDING_CELULA * 2,
        ellipsis: colunas[i].quebraLinha === false,
      });
      x += colunas[i].largura;
    }
    doc.y = y + alturaLinha;
    linhaIndex++;
  }
  doc.x = inicioX;
  doc.moveDown(0.5);
}
