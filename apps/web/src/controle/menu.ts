import { el } from "../comum/dom";
import type { Convite } from "../comum/convite";
import type { VisaoDoMenu } from "../comum/menu";
import { PainelDoMenu, type AcoesDoMenu } from "../comum/menu-dom";

// Este arquivo nunca importa Three.js nem nada de src/tela/, nem a biblioteca do QR (o build confere o tamanho do controle).

/**
 * O ☰ e o menu do celular (H7.4a e H7.4b). Vale no lobby e no jogo, para todos os jogadores: o líder gerencia (pausar, acabar, trancar, expulsar,
 * perdoar) e o resto só convida. O botão fica solto no canto de cima da tela (longe dos polegares) e o menu cobre tudo, para continuarem por cima
 * da tela de pausa e do lobby; o que aparece vem do último `lobby` (`comum/menu.ts`).
 */
export class MenuControle {
  private readonly botao = el("button", { class: "botao-menu-c", type: "button", title: "Menu", "aria-label": "Abrir o menu" }, "☰");
  private readonly fundo = el("div", { class: "menu-c" });
  private readonly painel: PainelDoMenu;

  /** @param aoAbrir o menu abriu: o jogo larga o joystick e os botões (o que o dedo faz com o menu aberto não vale) */
  constructor(acoes: AcoesDoMenu, aoAbrir: () => void) {
    this.painel = new PainelDoMenu(this.fundo, acoes, {
      textoFechar: "Fechar",
      aoMudarAberto: (aberto) => {
        if (aberto) aoAbrir();
      },
    });
    this.botao.hidden = true;
    this.botao.addEventListener("click", () => this.painel.alternar());
    document.body.append(this.botao, this.fundo);
  }

  get aberto(): boolean {
    return this.painel.aberto;
  }

  /** O que o menu mostra agora (chamado a cada `lobby` e a cada mudança de tela). Sem menu para esta pessoa, o ☰ some e o menu fecha. */
  definir(v: VisaoDoMenu): void {
    this.botao.hidden = !v.disponivel;
    document.body.classList.toggle("com-menu-c", v.disponivel); // a faixa de cima e o topo do lobby abrem espaço para o ☰
    this.painel.definirVisao(v);
  }

  definirConvite(c: Convite | null): void {
    this.painel.definirConvite(c);
  }
}
