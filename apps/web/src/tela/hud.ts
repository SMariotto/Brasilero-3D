import { FASE, acharTime, type Evento, type Fim, type PartidaMsg } from "@b3d/core";
import { el, trocar } from "../comum/dom";
import { corDoTexto as corTexto, distintivo, escudoSeExistir } from "../comum/escudo";
import { golsPorTime, textoDaLinha, vencedor, type LinhaDeGol } from "./fim";

const corDoTexto = corTexto;

function mmss(decimos: number): string {
  const s = Math.max(0, Math.ceil(decimos / 10));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Placar, relógio e avisos em HTML por cima do canvas (SPEC 7.2). Nada de texto 3D. */
export class Hud {
  private golsCasa = el("span", { id: "gols-casa", class: "gols" }, "0");
  private golsVisitante = el("span", { id: "gols-visitante", class: "gols" }, "0");
  private relogio = el("span", { id: "relogio", class: "relogio" }, "00:00");
  private mensagem = el("div", { id: "mensagem", class: "mensagem" });
  private faixaGol = el("div", { id: "faixa-gol", class: "faixa-gol" });
  private painelFim = el("div", { id: "painel-fim", class: "painel-fim" });
  private replayTag = el("div", { id: "replay-tag", class: "replay-tag" }, "REPLAY");
  private ouroTag = el("div", { id: "ouro-tag", class: "ouro-tag" }, "GOL DE OURO");
  private modoLeveTag = el("div", { id: "modo-leve-tag", class: "modo-leve-tag" }, "Modo leve");
  readonly botaoLeve = el("button", { id: "botao-leve", class: "botao-camera botao-leve", type: "button", title: "Modo leve: tira sombras, torcida e brilho (tecla L)" }, "Modo leve");
  readonly botaoCamera = el("button", { id: "botao-camera", class: "botao-camera", type: "button", title: "Trocar a câmera (tecla C)" }, "Câmera");

  private p: PartidaMsg | null = null;
  private siglas: [string, string] = ["CAS", "VIS"];
  /** O que está acontecendo no reinício atual ("FLA sai jogando", "Lateral: PAL"...). */
  private textoReinicio = "";
  private fim = false;

  constructor(private readonly raiz: HTMLElement) {}

  iniciar(p: PartidaMsg): void {
    this.p = p;
    this.fim = false;
    const casa = acharTime(p.config.casa);
    const visitante = acharTime(p.config.visitante);
    this.siglas = [casa?.sigla ?? "CAS", visitante?.sigla ?? "VIS"];

    const chip = (sigla: string, cor: string, time: typeof casa): HTMLElement => {
      const c = el("span", { class: "chip" }, escudoSeExistir(time, "escudo-placar"), sigla);
      c.style.background = cor;
      c.style.color = corDoTexto(cor);
      return c;
    };
    const placar = el(
      "div",
      { class: "placar", id: "placar" },
      chip(this.siglas[0], p.cores[0], casa),
      this.golsCasa,
      el("span", { class: "x" }, "x"),
      this.golsVisitante,
      chip(this.siglas[1], p.cores[1], visitante),
      this.relogio,
    );
    this.golsCasa.textContent = "0";
    this.golsVisitante.textContent = "0";
    this.relogio.textContent = mmss(p.config.duracao * 600); // antes de chegar o primeiro snapshot
    this.mensagem.textContent = "";
    this.faixaGol.replaceChildren();
    this.faixaGol.hidden = true;
    this.painelFim.replaceChildren();
    this.painelFim.hidden = true;
    this.replayTag.hidden = true;
    this.ouroTag.hidden = true;
    this.modoLeveTag.hidden = true;
    trocar(this.raiz, placar, this.mensagem, this.faixaGol, this.painelFim, this.replayTag, this.ouroTag, this.modoLeveTag, this.botaoLeve, this.botaoCamera);
  }

  /** Mesma partida, elenco mudou (humano entrou ou saiu): só atualiza os nomes. */
  atualizarElenco(p: PartidaMsg): void {
    this.p = p;
  }

  /** O replay do gol está passando: mostra a etiqueta REPLAY e esconde a faixa de GOOOL. */
  replay(ativo: boolean): void {
    this.replayTag.hidden = !ativo;
    if (ativo) this.faixaGol.hidden = true;
  }

  /** Avisa que o modo leve está ligado (o jogo roda sem sombras, torcida e brilho). */
  modoLeve(ligado: boolean): void {
    this.modoLeveTag.hidden = !ligado;
    this.botaoLeve.textContent = ligado ? "Modo normal" : "Modo leve";
  }

  limpar(): void {
    this.p = null;
    trocar(this.raiz);
  }

  private nome(slot: number): string {
    return this.p?.elenco.find((v) => v.slot === slot)?.nome ?? "?";
  }

  /** Chamado a cada quadro com o estado interpolado. */
  atualizar(a: { golsCasa: number; golsVisitante: number; relogio: number; fase: number }): void {
    if (!this.p) return;
    this.golsCasa.textContent = String(a.golsCasa);
    this.golsVisitante.textContent = String(a.golsVisitante);
    this.relogio.textContent = mmss(a.relogio);

    if (a.fase !== FASE.gol) {
      this.faixaGol.hidden = true;
      this.replayTag.hidden = true;
    }

    if (this.fim || a.fase === FASE.fim) this.mensagem.textContent = "";
    else if (a.fase === FASE.preJogo) this.mensagem.textContent = "Começando...";
    else if (a.fase === FASE.reinicio) this.mensagem.textContent = this.textoReinicio;
    else this.mensagem.textContent = "";
  }

  evento(e: Evento): void {
    if (e.tipo === "saida") this.textoReinicio = `${this.siglas[e.dados.time]} sai jogando`;
    else if (e.tipo === "lateral") this.textoReinicio = `Lateral: ${this.siglas[e.dados.time]}`;
    else if (e.tipo === "escanteio") this.textoReinicio = `Escanteio: ${this.siglas[e.dados.time]}`;
    else if (e.tipo === "tiroDeMeta") this.textoReinicio = `Tiro de meta: ${this.siglas[e.dados.time]}`;
    else if (e.tipo === "prorrogacao") {
      this.ouroTag.hidden = false;
      this.textoReinicio = "Empatou! Gol de ouro: quem marcar vence";
    } else if (e.tipo === "falta") {
      const vitima = this.p?.elenco.find((v) => v.slot === e.dados.em);
      this.textoReinicio = `Falta! Tiro livre: ${this.siglas[vitima?.time ?? 0]}`;
    }
    if (e.tipo !== "gol" || !this.p) return;

    const d = e.dados;
    const cor = this.p.cores[d.time];
    const quem = d.contra ? `${this.nome(d.slot)} (contra)` : this.nome(d.slot);
    this.faixaGol.style.setProperty("--cor-gol", cor);
    this.faixaGol.style.setProperty("--cor-texto-gol", corDoTexto(cor));
    const clube = acharTime(d.time === 0 ? this.p.config.casa : this.p.config.visitante);
    trocar(
      this.faixaGol,
      escudoSeExistir(clube, "escudo-gol"),
      el("strong", {}, "GOOOL!"),
      el("span", { class: "gol-time" }, `${this.siglas[d.time]}  ${d.placar[0]} x ${d.placar[1]}`),
      el("span", { class: "gol-quem" }, quem),
      d.assistencia !== undefined && el("span", { class: "gol-assist" }, `assistência: ${this.nome(d.assistencia)}`),
    );
    this.faixaGol.hidden = false;
  }

  mostrarFim(f: Fim): void {
    this.fim = true;
    this.faixaGol.hidden = true;
    const [a, b] = f.placar;
    const ganhou = vencedor(f);
    const times = [acharTime(this.p?.config.casa ?? ""), acharTime(this.p?.config.visitante ?? "")] as const;
    const nomes = [times[0]?.nome ?? this.siglas[0], times[1]?.nome ?? this.siglas[1]] as const;
    const corVencedora = ganhou === null || !this.p ? "#ffd54a" : this.p.cores[ganhou];
    this.painelFim.style.setProperty("--cor-vencedor", corVencedora);
    this.painelFim.classList.toggle("empate", ganhou === null);

    const lado = (t: 0 | 1, gols: number): HTMLElement => {
      const badge = distintivo(times[t], this.siglas[t]);
      badge.style.setProperty("--tam", "5.5em");
      return el(
        "div",
        { class: `fim-lado${ganhou === t ? " vencedor" : ""}` },
        badge,
        el("span", { class: "fim-nome" }, nomes[t]),
        el("span", { class: "fim-gols-num" }, String(gols)),
      );
    };

    const [golsCasa, golsVisitante] = golsPorTime(f, this.p?.elenco ?? []);
    const coluna = (linhas: LinhaDeGol[]): HTMLElement =>
      el("ul", { class: "fim-quem" }, ...(linhas.length > 0 ? linhas.map((l) => el("li", {}, `⚽ ${textoDaLinha(l)}`)) : [el("li", { class: "vazio" }, "sem gols")]));

    const cartao = (rotulo: string, d: { slot: number; quantidade: number } | null): HTMLElement | false =>
      d !== null && el("div", { class: "fim-cartao" }, el("small", {}, rotulo), el("strong", {}, this.nome(d.slot)), el("span", {}, String(d.quantidade)));

    trocar(
      this.painelFim,
      el("small", { class: "fim-titulo" }, "Fim de jogo"),
      el(
        "div",
        { class: "fim-placar", id: "placar-final" },
        lado(0, a),
        el("span", { class: "fim-x" }, "x"),
        lado(1, b),
      ),
      el("span", { class: "resultado" }, ganhou === null ? "Empate" : `${nomes[ganhou]} venceu`),
      f.prorrogacao === true && el("span", { class: "fim-ouro" }, ganhou === null ? "Prorrogação sem gols" : "Decidido no gol de ouro"),
      el("div", { class: "fim-gols-lista" }, coluna(golsCasa), coluna(golsVisitante)),
      el(
        "div",
        { class: "fim-destaques" },
        cartao("Artilheiro", f.destaques.artilheiro),
        cartao("Assistências", f.destaques.assistencias),
        cartao("Desarmes", f.destaques.desarmes),
      ),
      el("span", { class: "espera" }, "O Dono da sala escolhe: Revanche ou Lobby"),
      ...(ganhou === null ? [] : confete(corVencedora)),
    );
    this.painelFim.hidden = false;
  }
}

/** Papeizinhos que caem na tela de fim, na cor do time vencedor e em branco/amarelo. Só CSS: cada um tem o seu atraso e posição. */
function confete(cor: string): HTMLElement[] {
  const cores = [cor, "#ffffff", "#ffd54a", cor];
  return Array.from({ length: 36 }, (_, i) => {
    const p = el("i", { class: "confete" });
    p.style.setProperty("--x", `${(i * 2.77) % 100}%`);
    p.style.setProperty("--atraso", `${((i * 0.37) % 3).toFixed(2)}s`);
    p.style.setProperty("--dur", `${3.2 + ((i * 0.53) % 2.4)}s`);
    p.style.setProperty("--giro", `${(i * 47) % 360}deg`);
    p.style.background = cores[i % cores.length]!;
    return p;
  });
}
