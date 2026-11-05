import { acharTime, type Config, type JogadorLobby, type Lobby, type Time } from "@b3d/core";
import { el, trocar } from "../comum/dom";

const MODOS = { campo: "Campo", arena: "Arena" } as const;
const DIFICULDADES = { facil: "Fácil", medio: "Médio", dificil: "Difícil" } as const;

/** Preto ou branco, o que ler melhor sobre a cor do clube. */
function corDoTexto(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

/** Distintivo neutro: círculo com a sigla nas cores do clube (os escudos de verdade só entram na F5). */
function distintivo(time: Time | undefined): HTMLElement {
  const fundo = time?.cores.primaria ?? "#444444";
  const d = el("span", { class: "distintivo" }, time?.sigla ?? "???");
  d.style.background = fundo;
  d.style.color = corDoTexto(fundo);
  d.style.borderColor = time?.cores.secundaria ?? "#ffffff";
  return d;
}

function resumoConfig(c: Config): string {
  return [
    MODOS[c.modo],
    `${c.n} contra ${c.n}`,
    `${c.duracao} min`,
    `Bots: ${DIFICULDADES[c.dificuldade]}`,
    `Faltas: ${c.faltas ? "sim" : "não"}`,
  ].join("  ·  ");
}

function linhaJogador(j: JogadorLobby): HTMLElement {
  return el(
    "li",
    { class: `jogador${j.conectado ? "" : " sem-sinal"}${j.pronto ? " pronto" : ""}` },
    el("span", { class: "nome" }, j.apelido),
    j.dono && el("span", { class: "etiqueta" }, "Dono"),
    !j.conectado && el("span", { class: "etiqueta alerta" }, "sem sinal"),
    j.pronto && el("span", { class: "visto" }, "pronto"),
  );
}

function colunaTime(classe: "casa" | "visitante", titulo: string, time: Time | undefined, humanos: JogadorLobby[], n: number): HTMLElement {
  const vagas = Math.max(n, humanos.length);
  const lista = el("ul", { class: "vagas" });
  for (const j of humanos) lista.append(linhaJogador(j));
  for (let i = humanos.length; i < vagas; i++) lista.append(el("li", { class: "bot" }, "bot"));
  lista.append(el("li", { class: "bot goleiro" }, "goleiro: bot"));

  return el(
    "div",
    { class: `time ${classe}` },
    el("div", { class: "cabeca" }, distintivo(time), el("div", {}, el("small", {}, titulo), el("strong", {}, time?.nome ?? "?"))),
    lista,
  );
}

export interface LobbyTela {
  atualizar(lobby: Lobby): void;
  /** Mostra o código, o QR e o endereço para entrar. */
  definirEntrada(codigo: string, endereco: string, qr: string | null): void;
  definirPrincipal(principal: boolean): void;
}

/** Monta a tela de lobby do telão dentro de `raiz` (SPEC 3.1, item 2). */
export function criarLobby(raiz: HTMLElement): LobbyTela {
  const codigo = el("div", { class: "codigo" }, "----");
  const qr = el("img", { class: "qr", alt: "QR code para entrar na sala", width: "320", height: "320" });
  const endereco = el("p", { class: "endereco" });
  const entrada = el(
    "aside",
    { class: "entrada" },
    el("small", {}, "Código da sala"),
    codigo,
    qr,
    el("p", { class: "dica" }, "Aponte a câmera do celular para o QR"),
    endereco,
  );

  const resumo = el("p", { class: "resumo" });
  const times = el("div", { class: "times" });
  const semLado = el("div", { class: "sem-lado" });
  const rodape = el("p", { class: "rodape" });
  const principal = el("span", { class: "principal" });
  const jogo = el("div", { class: "jogo" }, resumo, times, semLado, rodape, principal);

  trocar(raiz, entrada, jogo);

  return {
    definirEntrada(cod, end, imagem) {
      codigo.textContent = cod;
      endereco.textContent = end;
      if (imagem) qr.setAttribute("src", imagem);
      else qr.removeAttribute("src");
    },

    definirPrincipal(p) {
      principal.textContent = p ? "Telão principal" : "";
    },

    atualizar(lobby) {
      const { config, jogadores } = lobby;
      resumo.textContent = resumoConfig(config);

      const casa = jogadores.filter((j) => j.lado === "casa");
      const visitante = jogadores.filter((j) => j.lado === "visitante");
      const tanto = jogadores.filter((j) => j.lado === "tanto");

      trocar(
        times,
        colunaTime("casa", "Casa", acharTime(config.casa), casa, config.n),
        colunaTime("visitante", "Visitante", acharTime(config.visitante), visitante, config.n),
      );

      trocar(
        semLado,
        tanto.length > 0 && el("small", {}, "Sem lado (tanto faz)"),
        tanto.length > 0 && el("ul", { class: "vagas solto" }, ...tanto.map(linhaJogador)),
      );

      const prontos = jogadores.filter((j) => j.pronto).length;
      rodape.textContent =
        jogadores.length === 0
          ? "Esperando o primeiro jogador entrar pelo celular..."
          : `${prontos} de ${jogadores.length} prontos  ·  ${lobby.telas} ${lobby.telas === 1 ? "telão" : "telões"}`;
    },
  };
}
