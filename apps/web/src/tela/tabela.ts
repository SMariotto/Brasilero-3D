import { acharTime, type CampeonatoMsg, type LinhaClube, type LinhaJogador } from "@b3d/core";
import { el, trocar } from "../comum/dom";
import { distintivo } from "../comum/escudo";

// Painel do campeonato da sala (F8a): tabela de pontos corridos dos clubes e estatísticas dos jogadores. Abre com a tecla T
// (ou o botão), fecha com T, Esc ou um clique. Só existe depois da primeira partida terminar.

const COLUNAS_CLUBE: Array<[string, string, (l: LinhaClube) => number]> = [
  ["Pts", "Pontos", (l) => l.pontos],
  ["J", "Jogos", (l) => l.jogos],
  ["V", "Vitórias", (l) => l.vitorias],
  ["E", "Empates", (l) => l.empates],
  ["D", "Derrotas", (l) => l.derrotas],
  ["GP", "Gols pró", (l) => l.golsPro],
  ["GC", "Gols contra", (l) => l.golsContra],
  ["SG", "Saldo de gols", (l) => l.saldo],
];

const COLUNAS_JOGADOR: Array<[string, string, (l: LinhaJogador) => number]> = [
  ["J", "Partidas", (l) => l.partidas],
  ["V", "Vitórias", (l) => l.vitorias],
  ["Gols", "Gols", (l) => l.gols],
  ["Ass", "Assistências", (l) => l.assistencias],
  ["Des", "Desarmes", (l) => l.desarmes],
];

/** "+3", "0", "-2": o saldo de gols com sinal. */
export function saldoComSinal(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function tabela(titulos: Array<[string, string]>, linhas: HTMLElement[]): HTMLElement {
  return el(
    "table",
    { class: "tab" },
    el("thead", {}, el("tr", {}, ...titulos.map(([t, dica]) => el("th", { title: dica }, t)))),
    el("tbody", {}, ...linhas),
  );
}

export class PainelTabela {
  readonly elemento: HTMLElement;
  private dados: CampeonatoMsg | null = null;
  private aoMudar: () => void = () => undefined;

  constructor(elemento: HTMLElement) {
    this.elemento = elemento;
    this.elemento.addEventListener("click", () => this.fechar());
  }

  /** Há tabela para mostrar (pelo menos uma partida terminou). */
  get temDados(): boolean {
    return (this.dados?.partidas ?? 0) > 0;
  }

  get aberto(): boolean {
    return !this.elemento.hidden;
  }

  /** Chamado quando o painel passa a ter ou deixa de ter dados, para o botão aparecer ou sumir. */
  aoMudarDados(fn: () => void): void {
    this.aoMudar = fn;
  }

  atualizar(msg: CampeonatoMsg): void {
    const tinha = this.temDados;
    this.dados = msg;
    if (!this.temDados) this.fechar();
    this.desenhar();
    if (tinha !== this.temDados) this.aoMudar();
  }

  alternar(): void {
    if (this.aberto) this.fechar();
    else if (this.temDados) {
      this.desenhar();
      this.elemento.hidden = false;
    }
  }

  fechar(): void {
    this.elemento.hidden = true;
  }

  private desenhar(): void {
    const d = this.dados;
    if (!d || d.partidas === 0) {
      trocar(this.elemento);
      return;
    }
    const clubes = d.clubes.map((l, i) => {
      const time = acharTime(l.clube);
      const badge = distintivo(time);
      badge.style.setProperty("--tam", "1.6em");
      return el(
        "tr",
        { class: i === 0 ? "lider" : "" },
        el("td", { class: "pos" }, String(i + 1)),
        el("td", { class: "clube" }, badge, el("span", {}, time?.nome ?? l.clube)),
        ...COLUNAS_CLUBE.map(([sigla, , valor]) => el("td", { class: sigla === "Pts" ? "pts" : "" }, sigla === "SG" ? saldoComSinal(valor(l)) : String(valor(l)))),
      );
    });
    const jogadores = d.jogadores.map((l, i) =>
      el("tr", { class: i === 0 ? "lider" : "" }, el("td", { class: "pos" }, String(i + 1)), el("td", { class: "clube" }, el("span", {}, l.apelido)), ...COLUNAS_JOGADOR.map(([, , valor]) => el("td", {}, String(valor(l))))),
    );

    trocar(
      this.elemento,
      el(
        "div",
        { class: "tabela-cartao" },
        el("h2", {}, "Campeonato da sala"),
        el("p", { class: "tabela-sub" }, `${d.partidas} ${d.partidas === 1 ? "partida" : "partidas"} · vitória 3 pontos, empate 1`),
        el(
          "div",
          { class: "tabela-colunas" },
          el("section", {}, el("h3", {}, "Clubes"), tabela([["#", ""], ["Clube", ""], ...COLUNAS_CLUBE.map(([t, dica]): [string, string] => [t, dica])], clubes)),
          el("section", {}, el("h3", {}, "Jogadores"), tabela([["#", ""], ["Jogador", ""], ...COLUNAS_JOGADOR.map(([t, dica]): [string, string] => [t, dica])], jogadores)),
        ),
        el("p", { class: "tabela-dica" }, "Tecla T ou clique para fechar. O líder zera o campeonato pelo celular."),
      ),
    );
  }
}
