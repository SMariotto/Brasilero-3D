import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { PadraoCamisa, UniformeResolvido } from "@b3d/core";
import { COR_BERMUDA_DO_MODELO, COR_CAMISA_DO_MODELO, COR_PELE_DO_JOGO, COR_PELE_DO_MODELO, TAMANHO_DA_SKIN, hexParaRgb, pintarSkin } from "./skin-gerada";

const N = TAMANHO_DA_SKIN;
const U = (padrao: PadraoCamisa): UniformeResolvido => ({ padrao, cor1: "#C8102E", cor2: "#F2F2F2", calcao: "#1B3F95", meiao: "#F2F2F2" });
const C1 = hexParaRgb("#C8102E");
const C2 = hexParaRgb("#F2F2F2");

/** Lê um PNG RGBA de 8 bits (o formato da skin modelo). */
function lerPngRgba(arquivo: URL): { w: number; h: number; dados: Uint8ClampedArray } {
  const b = readFileSync(arquivo);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  if (b[24] !== 8 || b[25] !== 6 || b[28] !== 0) throw new Error("só PNG RGBA de 8 bits, sem entrelaçamento");
  const idat: Buffer[] = [];
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o);
    if (b.toString("latin1", o + 4, o + 8) === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const cru = inflateSync(Buffer.concat(idat));
  const saida = new Uint8ClampedArray(w * h * 4);
  const linha = w * 4;
  for (let y = 0; y < h; y++) {
    const filtro = cru[y * (linha + 1)]!;
    for (let x = 0; x < linha; x++) {
      const bruto = cru[y * (linha + 1) + 1 + x]!;
      const esq = x >= 4 ? saida[y * linha + x - 4]! : 0;
      const cima = y > 0 ? saida[(y - 1) * linha + x]! : 0;
      const cimaEsq = x >= 4 && y > 0 ? saida[(y - 1) * linha + x - 4]! : 0;
      let v = bruto;
      if (filtro === 1) v += esq;
      else if (filtro === 2) v += cima;
      else if (filtro === 3) v += Math.floor((esq + cima) / 2);
      else if (filtro === 4) {
        const p = esq + cima - cimaEsq;
        const pa = Math.abs(p - esq);
        const pb = Math.abs(p - cima);
        const pc = Math.abs(p - cimaEsq);
        v += pa <= pb && pa <= pc ? esq : pb <= pc ? cima : cimaEsq;
      }
      saida[y * linha + x] = v & 255;
    }
  }
  return { w, h, dados: saida };
}

/** Um modelo sintético: camisa, mangas e bermuda chapadas nas áreas do layout, pele no resto e um pixel preto opaco. */
function modeloSintetico(): Uint8ClampedArray {
  const m = new Uint8ClampedArray(N * N * 4);
  const pintar = (x0: number, y0: number, w: number, h: number, c: readonly number[]): void => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.set([c[0]!, c[1]!, c[2]!, 255], (y * N + x) * 4);
  };
  pintar(0, 0, 48, 48, COR_PELE_DO_MODELO); // rosto
  pintar(0, 48, 80, 40, COR_CAMISA_DO_MODELO); // frente e costas
  pintar(80, 48, 48, 20, COR_CAMISA_DO_MODELO); // mangas
  pintar(80, 68, 48, 20, COR_BERMUDA_DO_MODELO); // cintura
  pintar(0, 88, 48, 16, COR_BERMUDA_DO_MODELO); // pernas da bermuda
  m.set([0, 0, 0, 255], (110 * N + 110) * 4); // chuteira: não é cor-chave
  return m;
}

const pixel = (d: Uint8ClampedArray, x: number, y: number): number[] => Array.from(d.subarray((y * N + x) * 4, (y * N + x) * 4 + 3));

describe("pintarSkin (skin gerada por código)", () => {
  const modelo = modeloSintetico();

  it("troca a camisa, a bermuda e a pele, e deixa o resto como estava (inclusive o transparente)", () => {
    const s = pintarSkin(modelo, U("liso"));
    expect(pixel(s, 20, 70)).toEqual([...C1]);
    expect(pixel(s, 90, 52)).toEqual([...C1]); // manga
    expect(pixel(s, 100, 75)).toEqual([...hexParaRgb("#1B3F95")]); // cintura da bermuda
    expect(pixel(s, 5, 95)).toEqual([...hexParaRgb("#1B3F95")]); // perna da bermuda
    expect(pixel(s, 10, 10)).toEqual([...COR_PELE_DO_JOGO]);
    expect(pixel(s, 110, 110)).toEqual([0, 0, 0]); // chuteira
    expect(s[(120 * N + 120) * 4 + 3]).toBe(0); // transparente continua
  });

  it("não mexe no modelo que recebeu", () => {
    const antes = Uint8ClampedArray.from(modelo);
    pintarSkin(modelo, U("listras-verticais"));
    expect(modelo).toEqual(antes);
  });

  it("listras-verticais: faixas de 4 px nas colunas, iguais na frente e nas costas", () => {
    const s = pintarSkin(modelo, U("listras-verticais"));
    expect(pixel(s, 1, 60)).toEqual([...C1]);
    expect(pixel(s, 5, 60)).toEqual([...C2]);
    expect(pixel(s, 9, 80)).toEqual([...C1]);
    expect(pixel(s, 41, 60)).toEqual([...C1]); // costas
    expect(pixel(s, 45, 60)).toEqual([...C2]);
  });

  it("listras-horizontais: faixas de 5 px nas linhas", () => {
    const s = pintarSkin(modelo, U("listras-horizontais"));
    expect(pixel(s, 20, 49)).toEqual([...C1]);
    expect(pixel(s, 20, 54)).toEqual([...C2]);
    expect(pixel(s, 20, 59)).toEqual([...C1]);
  });

  it("faixa-horizontal: uma faixa no meio do peito", () => {
    const s = pintarSkin(modelo, U("faixa-horizontal"));
    expect(pixel(s, 20, 68)).toEqual([...C2]);
    expect(pixel(s, 20, 50)).toEqual([...C1]);
    expect(pixel(s, 20, 86)).toEqual([...C1]);
  });

  it("faixa-diagonal: na frente vai do ombro (alto, à direita da imagem) ao quadril; nas costas continua espelhada", () => {
    const s = pintarSkin(modelo, U("faixa-diagonal"));
    expect(pixel(s, 38, 49)).toEqual([...C2]); // frente, alto à direita
    expect(pixel(s, 1, 86)).toEqual([...C2]); // frente, embaixo à esquerda
    expect(pixel(s, 2, 50)).toEqual([...C1]);
    expect(pixel(s, 38, 86)).toEqual([...C1]);
    expect(pixel(s, 41, 49)).toEqual([...C2]); // costas, alto à esquerda
    expect(pixel(s, 78, 86)).toEqual([...C2]); // costas, embaixo à direita
    expect(pixel(s, 78, 49)).toEqual([...C1]);
  });

  it("metade-vertical: a metade esquerda do boneco é cor1 (na frente fica à direita da imagem)", () => {
    const s = pintarSkin(modelo, U("metade-vertical"));
    expect(pixel(s, 5, 70)).toEqual([...C2]);
    expect(pixel(s, 35, 70)).toEqual([...C1]);
    expect(pixel(s, 45, 70)).toEqual([...C1]); // costas: esquerda do boneco é a da esquerda da imagem
    expect(pixel(s, 75, 70)).toEqual([...C2]);
    expect(pixel(s, 100, 52)).toEqual([...C1]); // braço esquerdo
    expect(pixel(s, 100, 62)).toEqual([...C2]); // braço direito
  });

  it("mangas-contraste: o tronco é cor1 e as mangas cor2", () => {
    const s = pintarSkin(modelo, U("mangas-contraste"));
    expect(pixel(s, 20, 70)).toEqual([...C1]);
    expect(pixel(s, 100, 52)).toEqual([...C2]);
    expect(pixel(s, 100, 62)).toEqual([...C2]);
  });
});

describe("a skin modelo de verdade (public/boneco/skin-modelo.png)", () => {
  const { w, h, dados } = lerPngRgba(new URL("../../public/boneco/skin-modelo.png", import.meta.url));
  const contar = (d: Uint8ClampedArray, c: readonly number[]): number => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2] && d[i + 3] !== 0) n++;
    return n;
  };

  it("tem 128x128 e as três cores-chave que a skin gerada troca", () => {
    expect([w, h]).toEqual([N, N]);
    expect(contar(dados, COR_CAMISA_DO_MODELO)).toBeGreaterThan(2000);
    expect(contar(dados, COR_BERMUDA_DO_MODELO)).toBeGreaterThan(1000);
    expect(contar(dados, COR_PELE_DO_MODELO)).toBeGreaterThan(3000);
  });

  it("depois de pintar não sobra nenhuma cor-chave, e o clube de listras fica com as duas cores", () => {
    const s = pintarSkin(dados, U("listras-verticais"));
    for (const c of [COR_CAMISA_DO_MODELO, COR_BERMUDA_DO_MODELO, COR_PELE_DO_MODELO]) expect(contar(s, c)).toBe(0);
    expect(contar(s, C1)).toBeGreaterThan(500);
    expect(contar(s, C2)).toBeGreaterThan(500);
  });

  it("o padrão liso pinta toda a camisa de uma cor só (as duas cores só aparecem nos padrões)", () => {
    const s = pintarSkin(dados, U("liso"));
    expect(contar(s, C1)).toBeGreaterThan(2000);
  });
});
