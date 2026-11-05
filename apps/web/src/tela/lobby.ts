import { CLUBE_ALEATORIO, acharTime, type Config, type JogadorLobby, type Lobby, type Time } from "@b3d/core";
import { el, trocar } from "../comum/dom";
import { distintivo } from "../comum/escudo";

const MODOS = { campo: "Campo", arena: "Arena" } as const;
const DIFICULDADES = { facil: "Fácil", medio: "Médio", dificil: "Difícil" } as const;

function resumoConfig(c: Config): string {
  return [
    MODOS[c.modo],
    `${c.n} contra ${c.n}`,
    `${c.duracao} min`,
    `Bots: ${DIFICULDADES[c.dificuldade]}`,
    `Faltas: ${c.faltas ? "sim" : "não"}`,
    ...(c.golDeOuro ? ["Gol de ouro"] : []),
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

const nomeDoClube = (id: string, time: Time | undefined): string => (id === CLUBE_ALEATORIO ? "Aleatório" : (time?.nome ?? "?"));

function colunaTime(classe: "casa" | "visitante", titulo: string, id: string, humanos: JogadorLobby[], n: number): HTMLElement {
  const time = acharTime(id);
  const vagas = Math.max(n, humanos.length);
  const lista = el("ul", { class: "vagas" });
  for (const j of humanos) lista.append(linhaJogador(j));
  for (let i = humanos.length; i < vagas; i++) lista.append(el("li", { class: "bot" }, "bot"));
  lista.append(el("li", { class: "bot goleiro" }, "goleiro: bot"));

  return el(
    "div",
    { class: `time ${classe}` },
    el("div", { class: "cabeca" }, distintivo(time), el("div", {}, el("small", {}, titulo), el("strong", {}, nomeDoClube(id, time)))),
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
        colunaTime("casa", "Casa", config.casa, casa, config.n),
        colunaTime("visitante", "Visitante", config.visitante, visitante, config.n),
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
