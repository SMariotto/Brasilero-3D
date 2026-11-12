// O painel do menu (H7.4a e H7.4b), em DOM. É o mesmo para o telão (o PC) e para o celular: cada lado dá o elemento de fundo, as ações, o convite
// e o CSS dele. O que aparece vem de `visaoDoMenu` (`comum/menu.ts`, com teste); aqui só se desenha e se pede o segundo toque do "Acabar" e do
// "Expulsar".

import { Confirmacao } from "./confirmar";
import { textoDoConvite, type Convite } from "./convite";
import { el, trocar } from "./dom";
import type { IdDoItem, LinhaDeJogador, LinhaDeRemovido, VisaoDoMenu } from "./menu";

export interface AcoesDoMenu {
  /** Pausa (`true`) ou retoma (`false`). */
  pausar(valor: boolean): void;
  /** Acaba a partida e volta ao lobby. */
  acabar(): void;
  /** Tranca (`true`) ou destranca (`false`) a sala. */
  trancar(valor: boolean): void;
  /** Tira o jogador da sala (já confirmado com o segundo toque). */
  expulsar(id: number): void;
  /** Tira o aparelho do removido da lista de bloqueados. */
  perdoar(id: number): void;
}

export interface OpcoesDoPainel {
  /** Um atalho de teclado a mostrar ao lado de cada item (o PC: "P"), ou nada. */
  atalhos?: Partial<Record<IdDoItem, string>>;
  /** O texto do botão de fechar ("Fechar", ou "Fechar (Esc)" no PC). */
  textoFechar: string;
  /** Chamado quando o menu abre ou fecha (o celular larga os dedos do jogo; o telão desliga as teclas de câmera). */
  aoMudarAberto(aberto: boolean): void;
}

/** O segundo toque vale por este tempo (ms); depois o botão volta ao normal. */
const PRAZO_CONFIRMACAO_MS = 3000;
/** Quanto tempo (ms) o botão "Copiar link" diz "Link copiado!". */
const COPIADO_MS = 2000;
/** A confirmação do "Acabar a partida" usa um id só: há um único item que pede. */
const ID_ACABAR = 1;

const VISAO_VAZIA: VisaoDoMenu = { disponivel: false, titulo: "", itens: [], nota: "", convite: null, jogadores: [], removidos: [] };

export class PainelDoMenu {
  private visao: VisaoDoMenu = VISAO_VAZIA;
  private convite: Convite | null = null;
  private abertoAgora = false;
  private copiado = false;
  private timerCopiado: ReturnType<typeof setTimeout> | undefined;

  private readonly titulo = el("h2", {}, "Menu");
  private readonly nota = el("p", { class: "menu-nota" });
  private readonly itens = el("div", { class: "menu-itens" });
  private readonly conviteEl = el("section", { class: "menu-convite" });
  private readonly jogadoresEl = el("section", { class: "menu-jogadores" });
  private readonly botaoFechar = el("button", { type: "button", class: "menu-fechar", "data-chave": "fechar" });
  private readonly corpo = el("div", { class: "menu-corpo" }, this.itens, this.conviteEl, this.jogadoresEl);
  private readonly painel = el("div", { class: "menu-painel", role: "dialog", "aria-label": "Menu" }, this.titulo, this.nota, this.corpo, this.botaoFechar);
  /** Dois segundos toques diferentes: acabar a partida (id fixo) e expulsar (o id do jogador). */
  private readonly confAcabar = new Confirmacao(PRAZO_CONFIRMACAO_MS, () => performance.now(), () => this.desenhar());
  private readonly confExpulsar = new Confirmacao(PRAZO_CONFIRMACAO_MS, () => performance.now(), () => this.desenhar());

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
    // Dentro de uma tela que bloqueia a rolagem (o jogo no celular), o painel ainda rola quando a lista cresce
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

  /** O bloco "Convidar": o código e o QR (telão) ou o link (celular). `null` enquanto o lado ainda não sabe (o QR do telão demora um instante). */
  definirConvite(c: Convite | null): void {
    this.convite = c;
    this.desenhar();
  }

  abrir(): void {
    if (this.abertoAgora || !this.visao.disponivel) return;
    this.abertoAgora = true;
    this.raiz.hidden = false;
    this.desenhar();
    this.opcoes.aoMudarAberto(true);
    (this.itens.querySelector<HTMLElement>("button") ?? this.botaoFechar).focus();
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
    // O menu se redesenha a cada `lobby` (e a cada segundo toque que vence); quem está com o teclado nele não pode perder o foco
    const foco = document.activeElement instanceof HTMLElement && this.painel.contains(document.activeElement) ? document.activeElement.getAttribute("data-chave") : null;

    const v = this.visao;
    this.titulo.textContent = v.titulo || "Menu";
    this.nota.textContent = v.nota;
    this.nota.hidden = v.nota === "";
    trocar(this.itens, ...v.itens.map((item) => this.botaoDoItem(item)));
    this.desenharConvite();
    this.desenharLista();

    if (foco) this.painel.querySelector<HTMLElement>(`[data-chave="${foco}"]`)?.focus();
  }

  private botaoDoItem(item: VisaoDoMenu["itens"][number]): HTMLElement {
    const armado = item.confirmar && this.confAcabar.pendente(ID_ACABAR);
    const atalho = this.opcoes.atalhos?.[item.id];
    const botao = el(
      "button",
      { type: "button", class: `menu-item${item.confirmar ? " perigo" : ""}${armado ? " armado" : ""}`, "data-item": item.id, "data-chave": `item-${item.id}` },
      armado ? item.textoConfirmar : item.texto,
      !armado && atalho ? el("small", {}, atalho) : null,
    );
    botao.addEventListener("click", () => this.escolher(item.id, item.confirmar));
    return botao;
  }

  private escolher(id: IdDoItem, confirmar: boolean): void {
    if (confirmar && !this.confAcabar.clicar(ID_ACABAR)) return; // primeiro toque: só arma o botão
    if (id === "trancar" || id === "destrancar") {
      // Trancar e destrancar deixam o menu aberto: o item troca de nome quando o `lobby` chega, e dá para ver o convite sumir
      this.acoes.trancar(id === "trancar");
      return;
    }
    this.fechar(); // o resultado (a tela de pausa, o lobby) já é a resposta; o `lobby` do servidor redesenha o menu
    if (id === "pausar") this.acoes.pausar(true);
    else if (id === "retomar") this.acoes.pausar(false);
    else this.acoes.acabar();
  }

  // --- Convidar ---------------------------------------------------------------------------------------------------------------

  private desenharConvite(): void {
    const modo = this.visao.convite;
    this.conviteEl.hidden = modo === null;
    if (modo === null) return;
    const c = this.convite;
    const filhos: (HTMLElement | null)[] = [el("h3", {}, "Convidar")];
    if (!c) {
      filhos.push(el("p", { class: "menu-endereco" }, "Montando o convite..."));
    } else {
      filhos.push(el("strong", { class: "menu-codigo" }, c.codigo));
      if (modo === "trancado") {
        // Trancada: o QR e o link somem; o código continua para quem já é da sala
        filhos.push(el("p", { class: "menu-trancada" }, "Sala trancada: ninguém novo entra. Só volta quem já estava na sala."));
      } else {
        if (c.qr) filhos.push(el("img", { class: "menu-qr", src: c.qr, alt: "QR code para entrar na sala" }));
        filhos.push(el("p", { class: "menu-endereco" }, c.endereco));
        if (c.link) filhos.push(this.botoesDeCompartilhar(c, c.link));
      }
    }
    trocar(this.conviteEl, ...filhos);
  }

  /** "Compartilhar" (a folha de compartilhar do celular) e "Copiar link", só nos aparelhos que têm; os dois podem falhar sem quebrar nada. */
  private botoesDeCompartilhar(c: Convite, link: string): HTMLElement {
    const caixa = el("div", { class: "menu-compartilhar" });
    if (typeof navigator.share === "function") {
      const b = el("button", { type: "button", class: "menu-item", "data-chave": "compartilhar" }, "Compartilhar");
      b.addEventListener("click", () => {
        void navigator.share({ title: "Brasilero 3D", text: textoDoConvite(c.codigo), url: link }).catch(() => undefined); // fechar a folha também rejeita
      });
      caixa.append(b);
    }
    if (typeof navigator.clipboard?.writeText === "function") {
      const b = el("button", { type: "button", class: "menu-item", "data-chave": "copiar" }, this.copiado ? "Link copiado!" : "Copiar link");
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(link).then(
          () => this.marcarCopiado(),
          () => undefined,
        );
      });
      caixa.append(b);
    }
    return caixa;
  }

  private marcarCopiado(): void {
    this.copiado = true;
    this.desenhar();
    clearTimeout(this.timerCopiado);
    this.timerCopiado = setTimeout(() => {
      this.copiado = false;
      this.desenhar();
    }, COPIADO_MS);
  }

  // --- Jogadores e removidos --------------------------------------------------------------------------------------------------

  private desenharLista(): void {
    const { jogadores, removidos } = this.visao;
    this.jogadoresEl.hidden = jogadores.length === 0 && removidos.length === 0;
    trocar(
      this.jogadoresEl,
      jogadores.length > 0 && el("h3", {}, "Jogadores"),
      jogadores.length > 0 && el("ul", { class: "menu-lista" }, ...jogadores.map((j) => this.linhaDoJogador(j))),
      removidos.length > 0 && el("h3", {}, "Removidos"),
      removidos.length > 0 && el("ul", { class: "menu-lista" }, ...removidos.map((r) => this.linhaDoRemovido(r))),
    );
  }

  private linhaDoJogador(j: LinhaDeJogador): HTMLElement {
    let expulsar: HTMLElement | null = null;
    if (j.podeExpulsar) {
      // Dois toques, como "Acabar a partida": o primeiro vira "Confirmar?" por 3 s
      const pedindo = this.confExpulsar.pendente(j.id);
      expulsar = el(
        "button",
        { type: "button", class: `menu-expulsar${pedindo ? " armado" : ""}`, "data-chave": `expulsar-${j.id}`, title: `Tirar ${j.apelido} da sala e bloquear o aparelho dele` },
        pedindo ? "Confirmar?" : "Expulsar",
      );
      expulsar.addEventListener("click", () => {
        if (this.confExpulsar.clicar(j.id)) this.acoes.expulsar(j.id);
      });
    }
    return el(
      "li",
      { class: `menu-linha${j.semSinal ? " sem-sinal" : ""}`, "data-jogador": String(j.id) },
      el("span", { class: "nome" }, j.apelido),
      j.lider && el("span", { class: "etiqueta" }, "Líder"),
      j.voce && el("span", { class: "etiqueta" }, "você"),
      j.semSinal && el("span", { class: "etiqueta alerta" }, "sem sinal"),
      expulsar,
    );
  }

  private linhaDoRemovido(r: LinhaDeRemovido): HTMLElement {
    let perdoar: HTMLElement | null = null;
    if (r.podePerdoar) {
      perdoar = el("button", { type: "button", class: "menu-perdoar", "data-chave": `perdoar-${r.id}`, title: `Deixar o aparelho de ${r.apelido} entrar de novo` }, "Perdoar");
      perdoar.addEventListener("click", () => this.acoes.perdoar(r.id));
    }
    return el("li", { class: "menu-linha removido", "data-removido": String(r.id) }, el("span", { class: "nome" }, r.apelido), perdoar);
  }
}
