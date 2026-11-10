import type { UniformeResolvido } from "@b3d/core";

// Skin gerada por código (H5) para os clubes que não têm PNG feito pelo Samuel, e para o goleiro: pega a skin modelo (128x128,
// camisa verde e bermuda azul de uma cor só) e troca essas duas cores pelas do uniforme, pintando também o padrão da camisa
// (listras, faixas, metades, mangas). Conta pura sobre os pixels (RGBA), sem canvas, para poder testar; `desenharSkinGerada` é a
// ponte com o canvas do navegador.

export const TAMANHO_DA_SKIN = 128;

/** As cores chapadas da skin modelo (`public/boneco/skin-modelo.png`) que viram as do uniforme. */
export const COR_CAMISA_DO_MODELO: readonly [number, number, number] = [34, 150, 64];
export const COR_BERMUDA_DO_MODELO: readonly [number, number, number] = [32, 72, 190];
export const COR_PELE_DO_MODELO: readonly [number, number, number] = [242, 160, 172];
/** A pele que as skins do Samuel usam (o modelo vem rosa de propósito, para ser fácil de achar). */
export const COR_PELE_DO_JOGO: readonly [number, number, number] = [236, 169, 142];

type Rgb = readonly [number, number, number];

/** `#RRGGBB` para [r, g, b]. */
export function hexParaRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// As áreas da skin (pixels), do layout.json do boneco
const AREA = {
  frente: { x: 0, y: 48, w: 40, h: 40 },
  costas: { x: 40, y: 48, w: 40, h: 40 },
  bracoEsq: { x: 80, y: 48, w: 48, h: 10 },
  bracoDir: { x: 80, y: 58, w: 48, h: 10 },
} as const;

const dentro = (a: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h;

/**
 * A cor da camisa no pixel (x, y). Nas costas a faixa e a metade ficam espelhadas, para continuar em volta do corpo. Nas mangas,
 * "vertical" são fios ao longo do braço e "horizontal" são anéis. "Esquerda" é a do boneco (a metade `cor1` da metade-vertical).
 */
export function corDaCamisa(x: number, y: number, u: UniformeResolvido): Rgb {
  const c1 = hexParaRgb(u.cor1);
  const c2 = hexParaRgb(u.cor2);
  const par = (n: number): boolean => Math.floor(n) % 2 === 0;

  const braco = dentro(AREA.bracoEsq, x, y) ? "esq" : dentro(AREA.bracoDir, x, y) ? "dir" : null;
  if (braco) {
    const a = braco === "esq" ? AREA.bracoEsq : AREA.bracoDir;
    const lx = x - a.x;
    const ly = y - a.y;
    switch (u.padrao) {
      case "listras-verticais":
        return par(ly / 2) ? c1 : c2;
      case "listras-horizontais":
        return par(lx / 6) ? c1 : c2;
      case "metade-vertical":
        return braco === "esq" ? c1 : c2;
      case "mangas-contraste":
        return c2;
      default:
        return c1;
    }
  }

  const costas = dentro(AREA.costas, x, y);
  if (!costas && !dentro(AREA.frente, x, y)) return c1;
  const a = costas ? AREA.costas : AREA.frente;
  const lx = x - a.x;
  const ly = y - a.y;
  const u01 = (lx + 0.5) / a.w;
  const v01 = (ly + 0.5) / a.h;
  switch (u.padrao) {
    case "listras-verticais":
      return par(lx / 4) ? c1 : c2;
    case "listras-horizontais":
      return par(ly / 5) ? c1 : c2;
    case "faixa-diagonal": {
      // Da frente, do ombro esquerdo do boneco (alto, à direita da imagem) ao quadril direito; nas costas, a continuação
      const distancia = costas ? Math.abs(u01 - v01) : Math.abs(u01 + v01 - 1);
      return distancia < 0.18 ? c2 : c1;
    }
    case "faixa-horizontal":
      return v01 > 0.36 && v01 < 0.64 ? c2 : c1;
    case "metade-vertical": {
      // Na frente a metade esquerda do boneco fica à direita da imagem; nas costas, à esquerda
      const esquerdaDoBoneco = costas ? u01 < 0.5 : u01 >= 0.5;
      return esquerdaDoBoneco ? c1 : c2;
    }
    default:
      return c1;
  }
}

const igual = (d: Uint8ClampedArray, i: number, c: Rgb): boolean => d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2];

/**
 * Pinta o uniforme sobre a skin modelo. `modelo` são os pixels RGBA (128x128) da `skin-modelo.png`; o resultado é uma cópia nova.
 * Só as cores chapadas do modelo (camisa, bermuda e pele) mudam; rosto, chuteira e o resto ficam como vieram.
 */
export function pintarSkin(modelo: Uint8ClampedArray, u: UniformeResolvido): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(modelo);
  const calcao = hexParaRgb(u.calcao);
  for (let y = 0; y < TAMANHO_DA_SKIN; y++) {
    for (let x = 0; x < TAMANHO_DA_SKIN; x++) {
      const i = (y * TAMANHO_DA_SKIN + x) * 4;
      if (saida[i + 3] === 0) continue;
      let cor: Rgb | null = null;
      if (igual(modelo, i, COR_CAMISA_DO_MODELO)) cor = corDaCamisa(x, y, u);
      else if (igual(modelo, i, COR_BERMUDA_DO_MODELO)) cor = calcao;
      else if (igual(modelo, i, COR_PELE_DO_MODELO)) cor = COR_PELE_DO_JOGO;
      if (cor) {
        saida[i] = cor[0];
        saida[i + 1] = cor[1];
        saida[i + 2] = cor[2];
      }
    }
  }
  return saida;
}

/** Desenha a skin gerada num canvas 128x128 a partir da imagem da skin modelo (só no navegador). */
export function desenharSkinGerada(modelo: CanvasImageSource, u: UniformeResolvido): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TAMANHO_DA_SKIN;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("canvas 2D indisponível");
  g.imageSmoothingEnabled = false;
  g.drawImage(modelo, 0, 0, TAMANHO_DA_SKIN, TAMANHO_DA_SKIN);
  const dados = g.getImageData(0, 0, TAMANHO_DA_SKIN, TAMANHO_DA_SKIN);
  dados.data.set(pintarSkin(dados.data, u));
  g.putImageData(dados, 0, 0);
  return canvas;
}
