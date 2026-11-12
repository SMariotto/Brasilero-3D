import { CHUTE, SERVIDOR, type Evento, type Fim, type MiraDoPasse, type PartidaMsg, type SituacaoJogador, type Voce } from "@b3d/core";
import { el, trocar } from "../comum/dom";
import { visaoDaPausa, type QuemPausou } from "../comum/pausa";
import { Botao } from "./botoes";
import { Envio } from "./envio";
import { Joystick } from "./joystick";

export interface AcoesJogo {
  /** Manda os 7 bytes ao servidor. */
  mandar(dados: Uint8Array): void;
  revanche(): void;
  lobby(): void;
  /** Pausa (`true`) ou retoma (`false`) a partida. Só o líder pode; o servidor confere de novo (H7.3). */
  pausar(valor: boolean): void;
}

/** Preto ou branco, o que ler melhor sobre a cor do time. */
function corDoTexto(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

/**
 * A tela do jogo no celular (SPEC 5): joystick à esquerda (a inclinação dele decide se o jogador anda ou corre), CHUTE e PASSE à
 * direita, faixa de cima com a cor do time, número, apelido e carga do chute. H3: não há stamina nem botão de correr. Não desenha o campo nem carrega Three.js.
 */
export class JogoControle {
  private readonly faixa = el("header", { class: "faixa-time" });
  private readonly numero = el("strong", { class: "numero" }, "");
  private readonly nome = el("span", { class: "nome-jogador" }, "");
  private readonly carga = el("div", { class: "barra-carga" }, el("i", {}));
  private readonly ping = el("span", { class: "ping-jogo" });
  private readonly aviso = el("div", { class: "aviso-jogo" });
  private readonly deitado = el("div", { class: "fica-deitado" }, "Fica melhor deitado");
  /** "Passe para #9": aparece só enquanto PASSE está apertado com a bola (H1). */
  private readonly miraEl = el("div", { class: "mira-passe" });
  private readonly fimPainel = el("div", { class: "fim-painel" });
  /** H7.3: o botão de pausar (só o líder vê; fica no canto da faixa de cima, longe dos polegares) e a tela "Jogo pausado". */
  private readonly botaoPausa = el("button", { class: "botao-pausa-c", type: "button", title: "Pausar o jogo", "aria-label": "Pausar o jogo" }, "⏸");
  private readonly pausaTitulo = el("strong", {});
  private readonly pausaDetalhe = el("span", {});
  private readonly pausaRetomar = el("button", { class: "retomar", type: "button" }, "Retomar");
  private readonly pausaEl = el("div", { class: "pausa-jogo", role: "status" }, this.pausaTitulo, this.pausaDetalhe, this.pausaRetomar);
  private souLider = false;
  private pausadaAtual = false;
  private pausadaPor: QuemPausou | undefined;

  private readonly joystick: Joystick;
  private readonly chute: Botao;
  private readonly passe: Botao;
  private readonly envio: Envio;

  private meuSlot = -1;
  private partidaId = -1;
  private comBola = false;
  private rodando = false;
  private quadro = 0;

  constructor(raiz: HTMLElement, private readonly acoes: AcoesJogo) {
    const zona = el("div", { class: "zona-joystick" });
    const base = el("div", { class: "joy-base" });
    const knob = el("div", { class: "joy-knob" });
    base.append(knob);
    base.hidden = true;
    zona.append(base);

    const bChute = el("button", { class: "botao-jogo chute", type: "button" }, "CHUTE");
    const bPasse = el("button", { class: "botao-jogo passe", type: "button" }, "PASSE");
    const botoes = el("div", { class: "botoes-jogo" }, bPasse, bChute);

    trocar(
      raiz,
      el("div", { class: "faixa-wrap" }, this.faixa),
      zona,
      botoes,
      this.deitado,
      this.miraEl,
      this.aviso,
      this.fimPainel,
      this.pausaEl,
    );
    trocar(this.faixa, this.numero, this.nome, this.carga, this.ping, this.botaoPausa);
    this.fimPainel.hidden = true;
    this.pausaEl.hidden = true;
    this.botaoPausa.hidden = true;
    this.botaoPausa.addEventListener("click", () => this.acoes.pausar(true));
    this.pausaRetomar.addEventListener("click", () => this.acoes.pausar(false));
    this.aviso.hidden = true;
    this.miraEl.hidden = true;

    this.envio = new Envio(
      {
        joystick: { get ang() { return joy.ang; }, get mag() { return joy.mag; } },
        chuteApertado: () => this.chute.apertado,
        passeApertado: () => this.passe.apertado,
      },
      (d) => acoes.mandar(d),
    );
    const joy = new Joystick(zona, base, knob, () => this.envio.joystickMudou());
    this.joystick = joy;

    this.chute = new Botao(bChute, () => this.envio.botaoApertado(), (_, ms) => this.envio.chuteSolto(ms));
    this.passe = new Botao(bPasse, () => this.envio.botaoApertado(), (_, ms) => this.envio.passeSolto(ms));

    // Sem zoom, sem menu de toque longo, sem rolagem (SPEC 5.2)
    raiz.addEventListener("contextmenu", (e) => e.preventDefault());
    raiz.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    raiz.addEventListener("dblclick", (e) => e.preventDefault());
    document.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  /** Começou (ou recomeçou) uma partida: zera os controles e começa a mandar comandos. */
  iniciar(p: PartidaMsg, meuId: number): void {
    const vaga = p.elenco.find((v) => v.idControle === meuId);
    this.meuSlot = vaga?.slot ?? -1;
    // Mesmo `id`: é a mesma partida com o elenco mudado; não zera nada, para não soltar o dedo do jogador no meio da jogada.
    if (p.id === this.partidaId && this.rodando) return;
    this.partidaId = p.id;
    this.fimPainel.hidden = true;
    this.joystick.zerar();
    this.chute.zerar();
    this.passe.zerar();
    this.aplicarSituacao(false, "normal");
    this.rodando = true;
    this.desenharPausa(); // o líder passa a ver o botão de pausar
    this.envio.iniciar();
    cancelAnimationFrame(this.quadro);
    this.quadro = requestAnimationFrame(this.animar);
  }

  /** Este celular é o do líder (H7.3)? Só ele vê o botão de pausar. */
  definirLider(souLider: boolean): void {
    this.souLider = souLider;
    this.desenharPausa();
  }

  /**
   * A partida está pausada (`lobby.pausada`)? Pausado, o celular mostra "Jogo pausado" por cima de tudo e zera o joystick e os botões (o que
   * o dedo faz com o jogo parado não vale); o "Retomar" só aparece para quem o servidor deixa retomar (ver `comum/pausa.ts`).
   */
  definirPausa(pausada: boolean, por: QuemPausou | undefined): void {
    const comecou = pausada && !this.pausadaAtual;
    this.pausadaAtual = pausada;
    this.pausadaPor = pausada ? por : undefined;
    this.desenharPausa();
    if (comecou) {
      this.joystick.zerar();
      this.chute.zerar();
      this.passe.zerar();
    }
  }

  private desenharPausa(): void {
    const v = visaoDaPausa(this.pausadaAtual, this.pausadaPor, this.souLider ? "lider" : "jogador");
    this.pausaEl.hidden = !v.visivel;
    this.pausaTitulo.textContent = v.titulo;
    this.pausaDetalhe.textContent = v.detalhe;
    this.pausaRetomar.hidden = !v.botaoRetomar;
    this.botaoPausa.hidden = !(this.souLider && this.rodando && !this.pausadaAtual);
  }

  parar(): void {
    this.pausadaAtual = false;
    this.pausadaPor = undefined;
    this.miraEl.hidden = true;
    this.rodando = false;
    this.desenharPausa();
    this.partidaId = -1;
    this.envio.parar();
    cancelAnimationFrame(this.quadro);
    this.joystick.zerar();
    this.chute.zerar();
    this.passe.zerar();
  }

  voce(v: Voce): void {
    if (v.situacao === "espera") {
      this.aviso.textContent = "Partida em andamento. Você entra na próxima.";
      this.aviso.hidden = false;
      this.faixa.style.background = "#444";
      this.nome.textContent = "";
      this.numero.textContent = "";
      return;
    }
    this.aviso.hidden = true;
    // O controle passou para outro jogador (passe, troca sozinha ou à mão, G1): a faixa pisca para o dedo perceber
    if (this.meuSlot >= 0 && v.slot !== this.meuSlot) this.piscarTroca();
    this.meuSlot = v.slot;
    this.faixa.style.background = v.cor;
    this.faixa.style.color = corDoTexto(v.cor);
    this.numero.textContent = String(v.numero);
    this.aplicarSituacao(v.comBola, v.situacao);
  }

  /** Pisca a faixa de cima e o número: "agora você é este jogador". */
  private piscarTroca(): void {
    this.faixa.classList.remove("troca");
    void this.faixa.offsetWidth; // reinicia a animação se trocar de novo logo em seguida
    this.faixa.classList.add("troca");
    navigator.vibrate?.(12);
  }

  /** Mensagem `mira` (H1): se é o meu jogador que está mirando, mostra quem vai receber o passe. */
  mira(miras: MiraDoPasse[]): void {
    const minha = miras.find((m) => m.de === this.meuSlot);
    this.miraEl.hidden = minha === undefined;
    this.miraEl.textContent = minha ? `${minha.alto ? "Lançamento" : "Passe"} para #${minha.numero}` : "";
  }

  /** Aviso de conexão lenta na faixa de cima (só aparece acima de 150 ms). */
  definirPing(ms: number): void {
    this.ping.textContent = ms > SERVIDOR.pingAvisoMs ? `⚠ ${ms} ms` : "";
  }

  setNome(apelido: string): void {
    this.nome.textContent = apelido;
  }

  /** Vibração no Android quando chuto ou passo (iPhone não vibra em site). */
  evento(e: Evento): void {
    if (e.tipo === "chute" && e.dados.slot === this.meuSlot) navigator.vibrate?.(25);
    else if (e.tipo === "passe" && e.dados.de === this.meuSlot) navigator.vibrate?.(15);
    else if (e.tipo === "roubo" && e.dados.slot === this.meuSlot) navigator.vibrate?.(30);
    else if (e.tipo === "falta" && e.dados.em === this.meuSlot) navigator.vibrate?.([40, 30, 40]);
    else if (e.tipo === "gol") navigator.vibrate?.([30, 40, 30]);
  }

  fim(f: Fim, souDono: boolean): void {
    this.miraEl.hidden = true;
    this.rodando = false;
    this.desenharPausa(); // acabou: sem botão de pausar
    this.envio.parar();
    this.joystick.zerar();
    const [a, b] = f.placar;
    trocar(
      this.fimPainel,
      el("small", {}, "Fim de jogo"),
      el("strong", {}, `${a} x ${b}`),
      el("span", { class: "resultado" }, a === b ? "Empate" : a > b ? "Casa venceu" : "Visitante venceu"),
      souDono
        ? el("div", { class: "fim-botoes" }, this.botaoFim("Revanche", this.acoes.revanche), this.botaoFim("Lobby", this.acoes.lobby))
        : el("span", { class: "espera" }, "Esperando o líder: Revanche ou Lobby"),
    );
    this.fimPainel.hidden = false;
  }

  private botaoFim(texto: string, acao: () => void): HTMLElement {
    const b = el("button", { type: "button", class: "botao-fim" }, texto);
    b.addEventListener("click", acao);
    return b;
  }

  /** Os rótulos e os botões ligados mudam conforme a situação (SPEC 5.1). */
  private aplicarSituacao(tem: boolean, situacao: SituacaoJogador): void {
    this.comBola = tem;
    const caido = situacao === "caido";
    const cobrando = situacao === "lateral" || situacao === "escanteio" || situacao === "falta";

    if (cobrando) {
      // Lateral: só PASSE (passe ou lançamento). Escanteio e falta: PASSE e cruzamento forte com CHUTE.
      this.chute.rotulo(situacao === "lateral" ? "CHUTE" : "CRUZAR");
      this.passe.rotulo("PASSE");
    } else {
      // Sem a bola (G1): CHUTE troca de jogador; PASSE dá o bote e, segurado por 0,3 s, vira carrinho
      if (tem) {
        this.chute.rotulo("CHUTE");
        this.passe.rotulo("PASSE");
      } else {
        this.chute.rotulo("TROCAR", "de jogador");
        this.passe.rotulo("BOTE", "segure: carrinho");
      }
    }

    this.chute.desligar(caido || situacao === "lateral");
    this.passe.desligar(caido);
  }

  /** A barra de carga do chute sobe enquanto CHUTE está apertado com a bola (medida aqui, igual à que vai ao servidor). */
  private readonly animar = (agora: number): void => {
    if (!this.rodando) return;
    this.quadro = requestAnimationFrame(this.animar);
    const barra = this.carga.firstElementChild as HTMLElement;
    if (this.chute.apertado && this.comBola) {
      const f = Math.min(1, (agora - this.chute.desde) / 1000 / CHUTE.cargaTotalS);
      barra.style.width = `${f * 100}%`;
      this.carga.classList.add("ativa");
    } else {
      barra.style.width = "0%";
      this.carga.classList.remove("ativa");
    }
  };
}
