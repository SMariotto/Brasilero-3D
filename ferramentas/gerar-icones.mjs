// Desenha os ícones do app (bola de futebol num campo à noite, com anel amarelo) e grava PNGs em apps/web/public/icones/.
// Sem dependências: o próprio script desenha pixel a pixel e monta o PNG com o zlib do Node.
// Uso: node ferramentas/gerar-icones.mjs     (só precisa rodar de novo se você quiser mudar o desenho)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const misturar = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const dentro = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** A cor do desenho no ponto (x, y), com x e y de 0 a 1. */
function cor(x, y) {
  // Gramado em faixas verticais, mais claro no alto (luz de refletor)
  const faixa = Math.floor(x * 8) % 2 === 0 ? hex("#0f3119") : hex("#0b2413");
  let c = misturar(faixa, hex("#2f5a3a"), Math.max(0, 0.7 - y) * 0.35);

  const cx = 0.5;
  const cy = 0.5;
  // Anel amarelo
  const d = Math.hypot(x - cx, y - cy);
  if (d <= 0.37 && d >= 0.335) return hex("#ffd54a");
  // Bola
  if (d < 0.335) {
    const luz = Math.max(0, 1 - Math.hypot(x - 0.42, y - 0.4) / 0.5);
    let bola = misturar(hex("#9aa59f"), hex("#ffffff"), Math.min(1, 0.35 + luz * 0.8));
    const preto = hex("#1b1b1b");
    if (dentro(x, y, cx, cy, 0.075)) bola = preto;
    for (let i = 0; i < 5; i++) {
      const a = (-90 + i * 72) * (Math.PI / 180);
      if (dentro(x, y, cx + Math.cos(a) * 0.235, cy + Math.sin(a) * 0.235, 0.05)) bola = preto;
    }
    return bola;
  }
  // Sombra da bola no chão
  if (d < 0.4) c = misturar(c, [0, 0, 0], 0.35 * (1 - (d - 0.37) / 0.03));
  return c;
}

function desenhar(tamanho) {
  const S = 3; // 3x3 amostras por pixel, para as bordas ficarem lisas
  const linhas = [];
  for (let py = 0; py < tamanho; py++) {
    const linha = Buffer.alloc(1 + tamanho * 4);
    linha[0] = 0; // filtro "nenhum"
    for (let px = 0; px < tamanho; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = cor((px + (sx + 0.5) / S) / tamanho, (py + (sy + 0.5) / S) / tamanho);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = S * S;
      linha.writeUInt8(Math.round(r / n), 1 + px * 4);
      linha.writeUInt8(Math.round(g / n), 2 + px * 4);
      linha.writeUInt8(Math.round(b / n), 3 + px * 4);
      linha.writeUInt8(255, 4 + px * 4);
    }
    linhas.push(linha);
  }
  return Buffer.concat(linhas);
}

function pedaco(tipo, dados) {
  const t = Buffer.from(tipo, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0);
  return Buffer.concat([len, t, dados, crc]);
}

function png(tamanho) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(desenhar(tamanho), { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

const pasta = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "public", "icones");
mkdirSync(pasta, { recursive: true });
for (const tamanho of [180, 192, 512]) {
  const arquivo = join(pasta, `icone-${tamanho}.png`);
  writeFileSync(arquivo, png(tamanho));
  console.log("Gravei", arquivo);
}
