import { beforeEach, describe, expect, it } from "vitest";
import { FASE } from "@b3d/core";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador, type Tela } from "./sala";

// H7.4b: "Trancar sala" e "Perdoar".
//  - Trancada, o `ola` de controle SEM token recebe SALA_FECHADA (mesmo sabendo o código). Quem já é da sala e caiu volta com o token. O
//    aparelho expulso continua barrado (EXPULSO), trancada ou não, e destrancar não o libera. Telão que só assiste continua entrando.
//  - Perdoar tira da lista de bloqueados o aparelho de um removido; ele só volta a poder entrar.

let tempo = 0;
let contadorToken = 0;
const agora = () => tempo;
let sala: Sala;

beforeEach(() => {
  tempo = 5_000_000;
  contadorToken = 0;
  sala = new Sala("ABCD", agora, () => `token${contadorToken++}`, { semente: () => 42, semBots: true, gerarChave: () => "chave-do-pc" });
});

type Entrada = { canal: CanalFalso; j: Jogador };

const AP = (n: number): string => n.toString(16).padStart(32, "0");

function entrar(apelido: string, aparelho?: string, lado?: "casa" | "visitante" | "tanto"): Entrada {
  const canal = new CanalFalso();
  const r = sala.entrarControle(canal, apelido, undefined, aparelho);
  if (!r.ok) throw new Error(`não entrou: ${r.codigo}`);
  if (lado) sala.tratarControle(r.valor, { t: "lado", lado });
  return { canal, j: r.valor };
}

/** Tenta entrar sem token e devolve o resultado, sem lançar. */
function tentar(apelido: string, aparelho?: string, token?: string): ReturnType<Sala["entrarControle"]> {
  return sala.entrarControle(new CanalFalso(), apelido, token, aparelho);
}

function telaMestre(): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal, { criou: true });
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

function telaVisitante(): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal);
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

function passarTempo(ms: number): void {
  for (let i = 0; i < ms; i += 8) {
    tempo += 8;
    sala.avancar();
  }
}

function varrerPor(s: number): void {
  for (let i = 0; i < s; i++) {
    tempo += 1000;
    sala.varrer();
  }
}

/** Ana (líder, Casa) e Beto (Visitante), com a partida na bola rolando. */
function partidaRolando(): { a: Entrada; b: Entrada; pc: ReturnType<typeof telaMestre> } {
  const pc = telaMestre();
  const a = entrar("Ana", AP(1), "casa");
  const b = entrar("Beto", AP(2), "visitante");
  sala.tratarControle(a.j, { t: "comecar" });
  passarTempo(7000);
  expect(sala.partida!.fase).toBe(FASE.jogo);
  return { a, b, pc };
}

describe("quem tranca e destranca", () => {
  it("a sala nasce destrancada: o lobby diz trancada false e sem removidos", () => {
    const a = entrar("Ana");
    expect(a.canal.ultimoLobby()).toMatchObject({ trancada: false, expulsos: [] });
  });

  it("o líder tranca pelo celular e o lobby de todos diz trancada", () => {
    const pc = telaMestre();
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    for (const c of [a.canal, b.canal, pc.canal]) expect(c.ultimoLobby().trancada).toBe(true);
    expect(a.canal.ultimoErro()).toBeUndefined();
  });

  it("o PC mestre tranca e destranca pelo telão", () => {
    const pc = telaMestre();
    const a = entrar("Ana");
    sala.tratarTela(pc.tela, { t: "trancar", valor: true });
    expect(a.canal.ultimoLobby().trancada).toBe(true);
    sala.tratarTela(pc.tela, { t: "trancar", valor: false });
    expect(a.canal.ultimoLobby().trancada).toBe(false);
    expect(pc.canal.ultimoErro()).toBeUndefined();
  });

  it("jogador comum e telão que só assiste recebem SEM_PERMISSAO, sem fechar a conexão, e a sala não tranca", () => {
    telaMestre();
    entrar("Ana");
    const b = entrar("Beto");
    const visitante = telaVisitante();
    sala.tratarControle(b.j, { t: "trancar", valor: true });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(visitante.tela, { t: "trancar", valor: true });
    expect(visitante.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(visitante.canal.fechadoCom).toBeNull();
    expect(b.canal.ultimoLobby().trancada).toBe(false);
  });

  it("sem líder só o PC tranca (a sala responde 'sem líder' a quem não é o PC)", () => {
    const pc = telaMestre();
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.tratarTela(pc.tela, { t: "expulsar", id: a.j.id }); // sem líder por 15 s
    sala.tratarControle(b.j, { t: "trancar", valor: true });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(pc.tela, { t: "trancar", valor: true });
    expect(b.canal.ultimoLobby().trancada).toBe(true);
  });

  it("repetir o mesmo valor não faz nada: sem erro e sem lobby repetido", () => {
    const a = entrar("Ana");
    sala.tratarControle(a.j, { t: "trancar", valor: false }); // já está destrancada
    const lobbies = a.canal.ultimas("lobby").length;
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    const depois = a.canal.ultimas("lobby").length;
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    expect(depois).toBe(lobbies + 1);
    expect(a.canal.ultimas("lobby").length).toBe(depois);
    expect(a.canal.ultimoErro()).toBeUndefined();
  });
});

describe("sala trancada: quem é novo não entra, quem já era volta", () => {
  it("o ola sem token recebe SALA_FECHADA, mesmo sabendo o código, e a sala não ganha jogador", () => {
    const a = entrar("Ana");
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    const r = tentar("Caio", AP(3));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("SALA_FECHADA");
    expect(sala.quantidadeJogadores).toBe(1);
  });

  it("a recusa vale também sem identificador de aparelho e com a partida rolando", () => {
    const { a } = partidaRolando();
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    for (const aparelho of [undefined, AP(7)]) {
      const r = tentar("Caio", aparelho);
      expect(r.ok, String(aparelho)).toBe(false);
      if (!r.ok) expect(r.codigo).toBe("SALA_FECHADA");
    }
  });

  it("quem já era da sala e caiu volta com o token como o mesmo jogador, em jogo", () => {
    const { a, b } = partidaRolando();
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    const slot = b.j.slot!;
    sala.desconectarControle(b.j, b.canal);
    const volta = new CanalFalso();
    const r = sala.entrarControle(volta, "Beto", b.j.token, AP(2));
    expect(r.ok).toBe(true);
    expect(sala.quantidadeJogadores).toBe(2);
    expect(sala.partida!.slotDoHumano(b.j.id)).toBe(slot);
    expect(volta.ultimoLobby().trancada).toBe(true);
  });

  it("quem cai e volta com a partida pausada e a sala trancada também entra", () => {
    const { a, b } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    sala.desconectarControle(b.j, b.canal);
    tempo += 5 * 60_000; // a vaga fica guardada com o jogo pausado (os 30 s não correm)
    sala.varrer();
    const r = sala.entrarControle(new CanalFalso(), "Beto", b.j.token, AP(2));
    expect(r.ok).toBe(true);
  });

  it("quem perdeu a vaga (passaram os 30 s) deixou de ser da sala: TOKEN_EXPIRADO e, sem token, SALA_FECHADA; o líder destranca e ele entra", () => {
    const { a, b } = partidaRolando();
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    sala.desconectarControle(b.j, b.canal);
    varrerPor(31);
    expect(sala.quantidadeJogadores).toBe(1);

    const comToken = sala.entrarControle(new CanalFalso(), "Beto", b.j.token, AP(2));
    expect(comToken.ok).toBe(false);
    if (!comToken.ok) expect(comToken.codigo).toBe("TOKEN_EXPIRADO");
    const semToken = sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(2));
    expect(semToken.ok).toBe(false);
    if (!semToken.ok) expect(semToken.codigo).toBe("SALA_FECHADA");

    sala.tratarControle(a.j, { t: "trancar", valor: false });
    expect(sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(2)).ok).toBe(true);
  });

  it("destrancar: o novato passa a entrar", () => {
    const a = entrar("Ana");
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    expect(tentar("Caio").ok).toBe(false);
    sala.tratarControle(a.j, { t: "trancar", valor: false });
    expect(tentar("Caio").ok).toBe(true);
  });

  it("a sala trancada continua trancada depois de acabar a partida e de começar outra", () => {
    const { a } = partidaRolando();
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    sala.tratarControle(a.j, { t: "lobby" });
    expect(a.canal.ultimoLobby()).toMatchObject({ emPartida: false, trancada: true });
    sala.tratarControle(a.j, { t: "comecar" });
    expect(a.canal.ultimoLobby()).toMatchObject({ emPartida: true, trancada: true });
    expect(tentar("Caio").ok).toBe(false);
  });

  it("trancar não tira ninguém, não pausa a partida e não mexe no líder", () => {
    const { a, b } = partidaRolando();
    const tick = sala.partida!.tick;
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    expect(sala.quantidadeJogadores).toBe(2);
    expect(b.canal.ultimoLobby().pausada).toBe(false);
    passarTempo(500);
    expect(sala.partida!.tick).toBeGreaterThan(tick);
    expect(sala.donoId()).toBe(a.j.id);
  });

  it("telão que só assiste continua entrando com a sala trancada (e o PC com a chave, também)", () => {
    const pc = telaMestre();
    const a = entrar("Ana");
    sala.tratarControle(a.j, { t: "trancar", valor: true });
    const visitante = new CanalFalso();
    expect(sala.entrarTela(visitante).ok).toBe(true);
    expect(visitante.ultimoLobby().trancada).toBe(true);
    sala.sairTela(pc.tela);
    const volta = sala.entrarTela(new CanalFalso(), { chave: "chave-do-pc" });
    expect(volta.ok && volta.valor.mestre).toBe(true);
  });
});

describe("o expulso continua barrado, trancada ou não", () => {
  it("EXPULSO vale antes de SALA_FECHADA: o aparelho removido recebe EXPULSO com a sala trancada", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "trancar", valor: true });
    const r = tentar("Beto", AP(2));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("EXPULSO");
  });

  it("destrancar não libera o expulso", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "trancar", valor: true });
    sala.tratarTela(pc.tela, { t: "trancar", valor: false });
    const r = tentar("Beto", AP(2));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("EXPULSO");
    expect(tentar("Beto", AP(9)).ok).toBe(true); // outro aparelho entra
  });

  it("o token de um expulso, com a sala trancada: com o aparelho recebe EXPULSO; sem o aparelho o token já não existe (TOKEN_EXPIRADO)", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "trancar", valor: true });
    const comAparelho = sala.entrarControle(new CanalFalso(), "Beto", b.j.token, AP(2));
    expect(comAparelho.ok).toBe(false);
    if (!comAparelho.ok) expect(comAparelho.codigo).toBe("EXPULSO");
    const semAparelho = sala.entrarControle(new CanalFalso(), "Beto", b.j.token);
    expect(semAparelho.ok).toBe(false);
    if (!semAparelho.ok) expect(semAparelho.codigo).toBe("TOKEN_EXPIRADO");
  });
});

describe("a lista de removidos (lobby.expulsos) e o perdoar", () => {
  it("quem é expulso com o identificador do aparelho entra na lista, na ordem em que saiu, e todos a veem", () => {
    const pc = telaMestre();
    const a = entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    const c = entrar("Caio", AP(3));
    sala.tratarTela(pc.tela, { t: "expulsar", id: c.j.id });
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    const esperado = [
      { id: c.j.id, apelido: "Caio" },
      { id: b.j.id, apelido: "Beto" },
    ];
    for (const canal of [a.canal, pc.canal]) expect(canal.ultimoLobby().expulsos).toEqual(esperado);
  });

  it("o lobby não vaza o identificador do aparelho de ninguém", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    expect(JSON.stringify(pc.canal.ultimoLobby())).not.toContain(AP(2));
  });

  it("expulsar quem não mandou o identificador remove da sala mas não entra na lista (não há o que bloquear)", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto");
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    expect(sala.quantidadeJogadores).toBe(1);
    expect(pc.canal.ultimoLobby().expulsos).toEqual([]);
  });

  it("o líder perdoa pelo celular: o aparelho sai da lista e o mesmo aparelho volta a entrar", () => {
    const pc = telaMestre();
    const a = entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    expect(tentar("Beto", AP(2)).ok).toBe(false);

    sala.tratarControle(a.j, { t: "perdoar", id: b.j.id });
    expect(a.canal.ultimoErro()).toBeUndefined();
    expect(a.canal.ultimoLobby().expulsos).toEqual([]);
    expect(pc.canal.ultimoLobby().expulsos).toEqual([]);
    expect(tentar("Beto", AP(2)).ok).toBe(true);
  });

  it("o PC mestre perdoa pelo telão", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "perdoar", id: b.j.id });
    expect(pc.canal.ultimoErro()).toBeUndefined();
    expect(tentar("Beto", AP(2)).ok).toBe(true);
  });

  it("perdoar só tira o escolhido: os outros removidos continuam barrados", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    const c = entrar("Caio", AP(3));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "expulsar", id: c.j.id });
    sala.tratarTela(pc.tela, { t: "perdoar", id: b.j.id });
    expect(pc.canal.ultimoLobby().expulsos).toEqual([{ id: c.j.id, apelido: "Caio" }]);
    expect(tentar("Beto", AP(2)).ok).toBe(true);
    const r = tentar("Caio", AP(3));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("EXPULSO");
  });

  it("perdoado com a sala trancada: deixa de receber EXPULSO, mas ainda recebe SALA_FECHADA até destrancar", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "trancar", valor: true });
    sala.tratarTela(pc.tela, { t: "perdoar", id: b.j.id });
    const r = tentar("Beto", AP(2));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("SALA_FECHADA");
    sala.tratarTela(pc.tela, { t: "trancar", valor: false });
    expect(tentar("Beto", AP(2)).ok).toBe(true);
  });

  it("id que não está na lista (já perdoado, ou de quem nunca foi removido) dá ALVO_INVALIDO, que não é fatal", () => {
    const pc = telaMestre();
    const a = entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "perdoar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "perdoar", id: b.j.id }); // de novo
    expect(pc.canal.ultimoErro()).toBe("ALVO_INVALIDO");
    expect(pc.canal.fechadoCom).toBeNull();
    sala.tratarControle(a.j, { t: "perdoar", id: a.j.id }); // a Ana não foi removida
    expect(a.canal.ultimoErro()).toBe("ALVO_INVALIDO");
    expect(a.canal.fechadoCom).toBeNull();
  });

  it("jogador comum e telão que só assiste não perdoam (SEM_PERMISSAO) e o bloqueio fica", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    const c = entrar("Caio", AP(3));
    const visitante = telaVisitante();
    sala.tratarTela(pc.tela, { t: "expulsar", id: c.j.id });
    sala.tratarControle(b.j, { t: "perdoar", id: c.j.id });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(visitante.tela, { t: "perdoar", id: c.j.id });
    expect(visitante.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(pc.canal.ultimoLobby().expulsos).toHaveLength(1);
    expect(tentar("Caio", AP(3)).ok).toBe(false);
  });

  it("expulsar de novo quem foi perdoado põe o aparelho de volta na lista (com outro id)", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "perdoar", id: b.j.id });
    const b2 = tentar("Beto", AP(2));
    expect(b2.ok).toBe(true);
    if (!b2.ok) return;
    sala.tratarTela(pc.tela, { t: "expulsar", id: b2.valor.id });
    expect(pc.canal.ultimoLobby().expulsos).toEqual([{ id: b2.valor.id, apelido: "Beto" }]);
    expect(b2.valor.id).not.toBe(b.j.id);
  });

  it("dois jogadores com o mesmo aparelho (duas abas): expulsar os dois não duplica a lista", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const b = entrar("Beto", AP(2));
    const b2 = entrar("Beto2", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    sala.tratarTela(pc.tela, { t: "expulsar", id: b2.j.id });
    expect(pc.canal.ultimoLobby().expulsos).toHaveLength(1);
    sala.tratarTela(pc.tela, { t: "perdoar", id: pc.canal.ultimoLobby().expulsos[0]!.id });
    expect(tentar("Beto", AP(2)).ok).toBe(true);
  });
});
