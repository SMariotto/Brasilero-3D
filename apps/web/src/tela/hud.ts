import { FASE, acharTime, type Evento, type Fim, type PartidaMsg } from "@b3d/core";
import { el, trocar } from "../comum/dom";

function corDoTexto(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

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
  readonly botaoCamera = el("button", { id: "botao-camera", class: "botao-camera", type: "button", title: "Trocar a câmera (tecla C)" }, "Câmera");

  private p: PartidaMsg | null = null;
  private siglas: [string, string] = ["CAS", "VIS"];
  private saidaTime: 0 | 1 = 0;
  private fim = false;

  constructor(private readonly raiz: HTMLElement) {}

  iniciar(p: PartidaMsg): void {
    this.p = p;
    this.fim = false;
    const casa = acharTime(p.config.casa);
    const visitante = acharTime(p.config.visitante);
    this.siglas = [casa?.sigla ?? "CAS", visitante?.sigla ?? "VIS"];

    const chip = (sigla: string, cor: string): HTMLElement => {
      const c = el("span", { class: "chip" }, sigla);
      c.style.background = cor;
      c.style.color = corDoTexto(cor);
      return c;
    };
    const placar = el(
      "div",
      { class: "placar", id: "placar" },
      chip(this.siglas[0], p.cores[0]),
      this.golsCasa,
      el("span", { class: "x" }, "x"),
      this.golsVisitante,
      chip(this.siglas[1], p.cores[1]),
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
    trocar(this.raiz, placar, this.mensagem, this.faixaGol, this.painelFim, this.botaoCamera);
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

    if (a.fase !== FASE.gol) this.faixaGol.hidden = true;

    if (this.fim || a.fase === FASE.fim) this.mensagem.textContent = "";
    else if (a.fase === FASE.preJogo) this.mensagem.textContent = "Começando...";
    else if (a.fase === FASE.reinicio) this.mensagem.textContent = `${this.siglas[this.saidaTime]} sai jogando`;
    else this.mensagem.textContent = "";
  }

  evento(e: Evento): void {
    if (e.tipo === "saida") this.saidaTime = e.dados.time;
    if (e.tipo !== "gol" || !this.p) return;

    const d = e.dados;
    const cor = this.p.cores[d.time];
    const quem = d.contra ? `${this.nome(d.slot)} (contra)` : this.nome(d.slot);
    this.faixaGol.style.setProperty("--cor-gol", cor);
    this.faixaGol.style.setProperty("--cor-texto-gol", corDoTexto(cor));
    trocar(
      this.faixaGol,
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
    const venceu = a === b ? "Empate" : a > b ? `${this.siglas[0]} venceu` : `${this.siglas[1]} venceu`;
    const art = f.destaques.artilheiro;
    const ass = f.destaques.assistencias;
    trocar(
      this.painelFim,
      el("small", {}, "Fim de jogo"),
      el("strong", { id: "placar-final" }, `${this.siglas[0]} ${a} x ${b} ${this.siglas[1]}`),
      el("span", { class: "resultado" }, venceu),
      art && el("span", {}, `Artilheiro: ${this.nome(art.slot)} (${art.quantidade})`),
      ass && el("span", {}, `Assistências: ${this.nome(ass.slot)} (${ass.quantidade})`),
      el("span", { class: "espera" }, "O Dono da sala escolhe: Revanche ou Lobby"),
    );
    this.painelFim.hidden = false;
  }
}
