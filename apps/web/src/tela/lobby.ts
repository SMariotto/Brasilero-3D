import { CLUBE_ALEATORIO, acharTime, type Config, type JogadorLobby, type Lobby, type Time } from "@b3d/core";
import { el, trocar } from "../comum/dom";
import { distintivo } from "../comum/escudo";
import { podeTornarLider, salaSemLider } from "./lider";

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

/** `aoTornarLider` só vem para o PC mestre (H7): aparece o botão "Tornar líder" nos celulares conectados que não são o líder. */
function linhaJogador(j: JogadorLobby, aoTornarLider: ((id: number) => void) | null): HTMLElement {
  let botao: HTMLElement | null = null;
  if (aoTornarLider && podeTornarLider(j, true)) {
    botao = el("button", { type: "button", class: "tornar-lider", title: `Passar a liderança da sala para ${j.apelido}` }, "Tornar líder");
    botao.addEventListener("click", () => aoTornarLider(j.id));
  }
  return el(
    "li",
    { class: `jogador${j.conectado ? "" : " sem-sinal"}${j.pronto ? " pronto" : ""}` },
    el("span", { class: "nome" }, j.apelido),
    j.dono && el("span", { class: "etiqueta" }, "Líder"),
    !j.conectado && el("span", { class: "etiqueta alerta" }, "sem sinal"),
    j.pronto && el("span", { class: "visto" }, "pronto"),
    botao,
  );
}

const nomeDoClube = (id: string, time: Time | undefined): string => (id === CLUBE_ALEATORIO ? "Aleatório" : (time?.nome ?? "?"));

function colunaTime(classe: "casa" | "visitante", titulo: string, id: string, humanos: JogadorLobby[], n: number, aoTornarLider: ((id: number) => void) | null): HTMLElement {
  const time = acharTime(id);
  const vagas = Math.max(n, humanos.length);
  const lista = el("ul", { class: "vagas" });
  for (const j of humanos) lista.append(linhaJogador(j, aoTornarLider));
  for (let i = humanos.length; i < vagas; i++) lista.append(el("li", { class: "bot" }, "bot"));
  lista.append(el("li", { class: "bot goleiro" }, "goleiro: bot"));

  return el(
    "div",
    { class: `time ${classe}` },
    el("div", { class: "cabeca" }, distintivo(time), el("div", {}, el("small", {}, titulo), el("strong", {}, nomeDoClube(id, time)))),
    lista,
  );
}

/** O que o telão mestre pode pedir pelo lobby (H7). */
export interface AcoesDoLobbyTela {
  /** O PC escolhe o líder da sala. */
  lider(id: number): void;
}

export interface LobbyTela {
  atualizar(lobby: Lobby): void;
  /** Este telão é o mestre (o PC)? Liga os botões do PC e a faixa que diz isso. */
  definirMestre(mestre: boolean): void;
  /** Mostra o código, o QR e o endereço para entrar. */
  definirEntrada(codigo: string, endereco: string, qr: string | null): void;
  definirPrincipal(principal: boolean): void;
}

/** Monta a tela de lobby do telão dentro de `raiz` (SPEC 3.1, item 2). */
export function criarLobby(raiz: HTMLElement, acoes: AcoesDoLobbyTela): LobbyTela {
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
  const semLider = el("p", { class: "sem-lider" });
  semLider.hidden = true;
  const jogo = el("div", { class: "jogo" }, resumo, semLider, times, semLado, rodape, principal);

  trocar(raiz, entrada, jogo);

  let mestre = false;
  let ehPrincipal = false;
  let ultimo: Lobby | null = null;

  /** O canto de baixo diz o que este telão é: o principal (toca o som) e/ou o PC da sala (escolhe o líder). Não ocupa altura nova. */
  function rotuloDoTelao(): void {
    principal.textContent = [ehPrincipal ? "Telão principal" : "", mestre ? "PC da sala" : ""].filter((t) => t !== "").join("  ·  ");
  }

  function desenhar(): void {
    if (!ultimo) return;
    const { config, jogadores } = ultimo;
    resumo.textContent = resumoConfig(config);
    const aoTornarLider = mestre ? acoes.lider : null;

    // Sala sem líder (a vaga dele venceu): o PC escolhe um, senão o mais antigo assume em 15 s
    const sem = salaSemLider(jogadores);
    semLider.hidden = !sem;
    semLider.textContent = mestre
      ? "A sala está sem líder. Clique em \"Tornar líder\" em um jogador (em 15 s o mais antigo assume)."
      : "A sala está sem líder. O PC escolhe um (em 15 s o mais antigo assume).";

    const casa = jogadores.filter((j) => j.lado === "casa");
    const visitante = jogadores.filter((j) => j.lado === "visitante");
    const tanto = jogadores.filter((j) => j.lado === "tanto");

    trocar(
      times,
      colunaTime("casa", "Casa", config.casa, casa, config.n, aoTornarLider),
      colunaTime("visitante", "Visitante", config.visitante, visitante, config.n, aoTornarLider),
    );

    trocar(
      semLado,
      tanto.length > 0 && el("small", {}, "Sem lado (tanto faz)"),
      tanto.length > 0 && el("ul", { class: "vagas solto" }, ...tanto.map((j) => linhaJogador(j, aoTornarLider))),
    );

    const prontos = jogadores.filter((j) => j.pronto).length;
    rodape.textContent =
      jogadores.length === 0
        ? "Esperando o primeiro jogador entrar pelo celular..."
        : `${prontos} de ${jogadores.length} prontos  ·  ${ultimo.telas} ${ultimo.telas === 1 ? "telão" : "telões"}`;
  }

  return {
    definirEntrada(cod, end, imagem) {
      codigo.textContent = cod;
      endereco.textContent = end;
      if (imagem) qr.setAttribute("src", imagem);
      else qr.removeAttribute("src");
    },

    definirPrincipal(p) {
      ehPrincipal = p;
      rotuloDoTelao();
    },

    definirMestre(m) {
      mestre = m;
      rotuloDoTelao();
      desenhar();
    },

    atualizar(lobby) {
      ultimo = lobby;
      desenhar();
    },
  };
}
