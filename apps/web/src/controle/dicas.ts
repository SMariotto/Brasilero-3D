// Dica para quem usa iPhone ou iPad: no Safari não dá para ter tela cheia sem "Adicionar à Tela de Início".

export interface DadosDoAparelho {
  userAgent: string;
  /** `navigator.platform`. */
  plataforma: string;
  pontosDeToque: number;
  /** O app já foi aberto pelo ícone da tela de início (navigator.standalone ou display-mode). */
  instalado: boolean;
}

/** iPhone, iPad (inclusive o que se apresenta como Mac) e iPod. */
export function ehAparelhoApple(d: DadosDoAparelho): boolean {
  return /iPhone|iPad|iPod/i.test(d.userAgent) || (d.plataforma === "MacIntel" && d.pontosDeToque > 1);
}

/** Mostra a dica só no Safari do iPhone/iPad que ainda não está instalado, e só se a pessoa não dispensou. */
export function deveMostrarDicaDeInstalar(d: DadosDoAparelho, dispensada: boolean): boolean {
  return ehAparelhoApple(d) && !d.instalado && !dispensada;
}

export const TEXTO_DICA_IPHONE = "No iPhone, para jogar em tela cheia: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o jogo por esse ícone.";

const CHAVE = "b3d.dica-iphone";

export function dadosDoNavegador(): DadosDoAparelho {
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone = nav.standalone === true;
  try {
    standalone = standalone || window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
  } catch {
    /* sem matchMedia */
  }
  return { userAgent: nav.userAgent, plataforma: nav.platform, pontosDeToque: nav.maxTouchPoints, instalado: standalone };
}

export function dicaJaDispensada(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

export function dispensarDica(): void {
  try {
    localStorage.setItem(CHAVE, "1");
  } catch {
    /* sem armazenamento: a dica volta na próxima vez */
  }
}
