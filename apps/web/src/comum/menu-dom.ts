// O painel do menu da partida (H7.4a), em DOM. É o mesmo para o telão (o PC) e para o celular do líder: cada lado dá o elemento de fundo, as
// ações e o CSS dele. O que aparece vem de `visaoDoMenu` (`comum/menu.ts`, com teste); aqui só se desenha e se pede o segundo toque do "Acabar".

import { Confirmacao } from "./confirmar";
import { el, trocar } from "./dom";
import type { IdDoItem, VisaoDoMenu } from "./menu";

export interface AcoesDoMenu {
  /** Pausa (`true`) ou retoma (`false`). */
  pausar(valor: boolean): void;
  /** Acaba a partida e volta ao lobby. */
  acabar(): void;
}

export interface OpcoesDoPainel {
  /** Um atalho de teclado a mostrar ao lado de cada item (o PC: "P"), ou nada. */
  atalhos?: Partial<Record<IdDoItem, string>>;
  /** O texto do botão de fechar ("Fechar", ou "Fechar (Esc)" no PC). */
  textoFechar: string;
  /** Chamado quando o menu abre ou fecha (o celular zera os dedos; o telão desliga as teclas de câmera). */
  aoMudarAberto(aberto: boolean): void;
}

/** O segundo toque no "Acabar a partida" vale por este tempo (ms); depois o botão volta ao normal. */
const PRAZO_CONFIRMACAO_MS = 3000;
/** A confirmação usa um id só: há um único item que pede. */
const ID_ACABAR = 1;

export class PainelDoMenu {
  private visao: VisaoDoMenu = { disponivel: false, itens: [], nota: "" };
  private abertoAgora = false;
  private readonly titulo = el("h2", {}, "Menu da partida");
  private readonly nota = el("p", { class: "menu-nota" });
  private readonly lista = el("div", { class: "menu-itens" });
  private readonly botaoFechar = el("button", { type: "button", class: "menu-fechar" });
  private readonly painel = el("div", { class: "menu-painel", role: "dialog", "aria-label": "Menu da partida" }, this.titulo, this.nota, this.lista, this.botaoFechar);
  private readonly confirmacao = new Confirmacao(PRAZO_CONFIRMACAO_MS, () => performance.now(), () => this.desenhar());

  /**
   * @param raiz o fundo do menu (cobre a tela; clicar fora do painel fecha). O painel é montado dentro dele.
   */
  constructor(
    private readonly raiz: HTMLElement,
    private readonly acoes: AcoesDoMenu,
    private readonly opcoes: OpcoesDoPainel,
  ) {
    this.botaoFechar.textContent = opcoes.textoFechar;
    this.botaoFechar.addEventListener("click", () => this.fechar());
    trocar(raiz, this.painel);
    raiz.hidden = true;
    raiz.addEventListener("click", (e) => {
      if (e.target === raiz) this.fechar();
    });
    // Dentro de uma tela que bloqueia a rolagem (o jogo no celular), o painel ainda pode rolar quando a lista crescer (H7.4b)
    this.painel.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
  }

  get aberto(): boolean {
    return this.abertoAgora;
  }

  /** O que o menu mostra agora. Sem menu para esta pessoa (`disponivel` falso), ele fecha. Chamado a cada `lobby`, então os dois menus convergem. */
  definirVisao(v: VisaoDoMenu): void {
    this.visao = v;
    if (!v.disponivel && this.abertoAgora) this.fechar();
    else this.desenhar();
  }

  abrir(): void {
    if (this.abertoAgora || !this.visao.disponivel) return;
    this.abertoAgora = true;
    this.raiz.hidden = false;
    this.desenhar();
    this.opcoes.aoMudarAberto(true);
    this.lista.querySelector<HTMLElement>("button")?.focus();
  }

  fechar(): void {
    if (!this.abertoAgora) return;
    this.abertoAgora = false;
    this.raiz.hidden = true;
    this.opcoes.aoMudarAberto(false);
  }

  alternar(): void {
    if (this.abertoAgora) this.fechar();
    else this.abrir();
  }

  private desenhar(): void {
    this.nota.textContent = this.visao.nota;
    this.nota.hidden = this.visao.nota === "";
    trocar(
      this.lista,
      ...this.visao.itens.map((item) => {
        const armado = item.confirmar && this.confirmacao.pendente(ID_ACABAR);
        const atalho = this.opcoes.atalhos?.[item.id];
        const botao = el(
          "button",
          { type: "button", class: `menu-item${item.confirmar ? " perigo" : ""}${armado ? " armado" : ""}`, "data-item": item.id },
          armado ? item.textoConfirmar : item.texto,
          !armado && atalho ? el("small", {}, atalho) : null,
        );
        botao.addEventListener("click", () => this.escolher(item.id, item.confirmar));
        return botao;
      }),
    );
  }

  private escolher(id: IdDoItem, confirmar: boolean): void {
    if (confirmar && !this.confirmacao.clicar(ID_ACABAR)) return; // primeiro toque: só arma o botão
    this.fechar(); // o resultado (a tela de pausa, o lobby) já é a resposta; o `lobby` do servidor redesenha o menu
    if (id === "pausar") this.acoes.pausar(true);
    else if (id === "retomar") this.acoes.pausar(false);
    else this.acoes.acabar();
  }
}
