import type { Time } from "@b3d/core";

// Escudos (SPEC 9.4): o jogo NÃO traz nenhum escudo e não baixa logo da internet. Se existir `public/escudos/<id>.png`
// (colocado pelo Samuel), ele aparece; se não, desenha um distintivo neutro: círculo com a sigla nas cores do clube.

/** Já sabemos se o PNG de cada clube existe? Evita pedir de novo um arquivo que deu 404. */
const existe = new Map<string, boolean>();

const base = (): string => import.meta.env.BASE_URL.replace(/\/$/, "");

/** Endereço do PNG do clube (pode não existir). */
export const urlDoEscudo = (id: string): string => `${base()}/escudos/${id}.png`;

/** Preto ou branco, o que ler melhor sobre a cor. */
export function corDoTexto(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

function imagemDoEscudo(time: Time, aoCarregar: () => void): HTMLImageElement | null {
  if (existe.get(time.id) === false) return null;
  const img = document.createElement("img");
  img.className = "escudo-img";
  img.alt = "";
  img.draggable = false;
  img.addEventListener("load", () => {
    existe.set(time.id, true);
    aoCarregar();
  });
  img.addEventListener("error", () => {
    existe.set(time.id, false);
    img.remove();
  });
  img.src = urlDoEscudo(time.id);
  return img;
}

/**
 * Distintivo do clube: o escudo (se houver o PNG) ou um círculo neutro com a sigla. O tamanho vem do CSS (`--tam`).
 * Sem clube (por exemplo "Aleatório") mostra um círculo cinza com "?".
 */
export function distintivo(time: Time | undefined, rotulo?: string): HTMLElement {
  const fundo = time?.cores.primaria ?? "#4b5563";
  const d = document.createElement("span");
  d.className = "distintivo";
  d.textContent = rotulo ?? time?.sigla ?? "?";
  d.style.background = fundo;
  d.style.color = corDoTexto(fundo);
  d.style.borderColor = time?.cores.secundaria ?? "#9ca3af";
  if (time) {
    const img = imagemDoEscudo(time, () => d.classList.add("com-escudo"));
    if (img) d.append(img);
  }
  return d;
}

/** Só o escudo, escondido até o PNG carregar. Para lugares que já têm a cor e a sigla do lado (placar, faixa de gol). */
export function escudoSeExistir(time: Time | undefined, classe = "escudo-solto"): HTMLElement {
  const img = time ? imagemDoEscudo(time, () => undefined) : null;
  if (!img) {
    const vazio = document.createElement("span");
    vazio.hidden = true;
    return vazio;
  }
  img.classList.add(classe);
  return img;
}
