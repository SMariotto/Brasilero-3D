import { TIMES, type Config, type Lado, type Lobby } from "@b3d/core";
import { el, trocar } from "../comum/dom";

export interface Acoes {
  lado(lado: Lado): void;
  pronto(valor: boolean): void;
  config(mudanca: Partial<Config>): void;
  comecar(): void;
}

export interface LobbyControle {
  atualizar(lobby: Lobby, meuId: number): void;
  definirPing(ms: number | null): void;
}

const LADOS: [Lado, string][] = [
  ["casa", "Casa"],
  ["visitante", "Visitante"],
  ["tanto", "Tanto faz"],
];
const NOME_LADO: Record<Lado, string> = { casa: "Casa", visitante: "Visitante", tanto: "Tanto faz" };

interface Selecao {
  linha: HTMLElement;
  definir(valor: string): void;
}

/** Linha "rótulo + lista" do painel do Dono. Não mexe no valor enquanto a pessoa está com a lista aberta. */
function selecao(rotulo: string, opcoes: [string, string][], aoMudar: (valor: string) => void): Selecao {
  const s = el("select", {});
  for (const [valor, texto] of opcoes) s.append(el("option", { value: valor }, texto));
  s.addEventListener("change", () => aoMudar(s.value));
  return {
    linha: el("label", { class: "linha" }, el("span", {}, rotulo), s),
    definir(valor) {
      if (document.activeElement !== s) s.value = valor;
    },
  };
}

/** Lobby do celular (SPEC 3.2, item 2): lado, pronto e, para o Dono, a configuração da partida. */
export function criarLobbyControle(raiz: HTMLElement, acoes: Acoes): LobbyControle {
  const sala = el("strong", { class: "sala" });
  const ping = el("span", { class: "ping-c" });
  const topo = el("header", { class: "topo" }, el("span", {}, "Sala ", sala), ping);
  const quem = el("p", { class: "quem" });

  const botoesLado = new Map<Lado, HTMLButtonElement>();
  const ladoBox = el("div", { class: "lados" });
  for (const [lado, texto] of LADOS) {
    const b = el("button", { type: "button", class: `lado ${lado}` }, texto);
    b.addEventListener("click", () => acoes.lado(lado));
    botoesLado.set(lado, b);
    ladoBox.append(b);
  }

  let prontoAtual = false;
  const botaoPronto = el("button", { type: "button", class: "pronto" }, "Pronto");
  botaoPronto.addEventListener("click", () => acoes.pronto(!prontoAtual));

  const lista = el("ul", { class: "lista" });

  const opcoesTimes: [string, string][] = TIMES.map((t) => [t.id, `${t.sigla} — ${t.nome}`]);
  const casa = selecao("Casa", opcoesTimes, (v) => acoes.config({ casa: v }));
  const visitante = selecao("Visitante", opcoesTimes, (v) => acoes.config({ visitante: v }));
  const modo = selecao("Modo", [["campo", "Campo"], ["arena", "Arena"]], (v) => acoes.config({ modo: v as Config["modo"] }));
  const n = selecao("Jogadores de linha", [["3", "3 contra 3"], ["4", "4 contra 4"], ["5", "5 contra 5"]], (v) =>
    acoes.config({ n: Number(v) as Config["n"] }),
  );
  const duracao = selecao("Duração", [["2", "2 min"], ["4", "4 min"], ["6", "6 min"], ["8", "8 min"]], (v) =>
    acoes.config({ duracao: Number(v) as Config["duracao"] }),
  );
  const dificuldade = selecao("Bots", [["facil", "Fácil"], ["medio", "Médio"], ["dificil", "Difícil"]], (v) =>
    acoes.config({ dificuldade: v as Config["dificuldade"] }),
  );
  const faltas = selecao("Faltas", [["sim", "Sim"], ["nao", "Não"]], (v) => acoes.config({ faltas: v === "sim" }));

  const comecar = el("button", { type: "button", class: "comecar" }, "Começar");
  comecar.addEventListener("click", () => acoes.comecar());

  const painelDono = el(
    "section",
    { class: "painel-dono" },
    el("h2", {}, "Você é o Dono da sala"),
    casa.linha,
    visitante.linha,
    modo.linha,
    n.linha,
    duracao.linha,
    dificuldade.linha,
    faltas.linha,
    comecar,
  );
  painelDono.hidden = true;
  const esperaDono = el("p", { class: "espera" }, "Quem criou a sala escolhe os times e começa o jogo.");

  trocar(raiz, topo, quem, el("h2", {}, "Seu lado"), ladoBox, botaoPronto, painelDono, esperaDono, el("h2", {}, "Na sala"), lista);

  return {
    definirPing(ms) {
      ping.textContent = ms === null ? "" : `${ms} ms`;
    },

    atualizar(lobby, meuId) {
      sala.textContent = lobby.sala;
      const eu = lobby.jogadores.find((j) => j.id === meuId);
      if (!eu) return;

      quem.textContent = eu.apelido;
      for (const [lado, b] of botoesLado) b.classList.toggle("ativo", eu.lado === lado);
      prontoAtual = eu.pronto;
      botaoPronto.classList.toggle("ativo", eu.pronto);
      botaoPronto.textContent = eu.pronto ? "Pronto!" : "Pronto";

      painelDono.hidden = !eu.dono;
      esperaDono.hidden = eu.dono;

      const c = lobby.config;
      casa.definir(c.casa);
      visitante.definir(c.visitante);
      modo.definir(c.modo);
      n.definir(String(c.n));
      duracao.definir(String(c.duracao));
      dificuldade.definir(c.dificuldade);
      faltas.definir(c.faltas ? "sim" : "nao");

      trocar(
        lista,
        ...lobby.jogadores.map((j) =>
          el(
            "li",
            { class: `${j.conectado ? "" : "sem-sinal"} ${j.id === meuId ? "eu" : ""}` },
            el("span", { class: "nome" }, j.apelido),
            j.dono && el("span", { class: "etiqueta" }, "Dono"),
            el("span", { class: "lado-txt" }, NOME_LADO[j.lado]),
            j.pronto && el("span", { class: "visto" }, "✓"),
            !j.conectado && el("span", { class: "etiqueta alerta" }, "sem sinal"),
          ),
        ),
      );
    },
  };
}
