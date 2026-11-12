import { beforeEach, describe, expect, it } from "vitest";
import { ACAO, BOTAO, FASE, anguloParaByte, codificarComando, comandoParado, decodificarSnapshot, magParaByte, type Comando, type Evento, type PartidaMsg, type Voce } from "@b3d/core";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador, type Tela } from "./sala";

// H7.3: pausar e retomar. O líder (celular) e o PC (telão mestre) pausam; parado, o laço não roda passo nenhum e não sai snapshot. A pausa do PC
// só o PC retoma. Ao retomar, o que foi apertado com o jogo parado não vale (`Partida.aoRetomar`, da H7.0) e o laço não "recupera" o tempo parado.

let tempo = 0;
let contadorToken = 0;
const agora = () => tempo;
let sala: Sala;

function nova(semBots: boolean): Sala {
  contadorToken = 0;
  return new Sala("ABCD", agora, () => `token${contadorToken++}`, { semente: () => 42, semBots, gerarChave: () => "chave-do-pc" });
}

beforeEach(() => {
  tempo = 5_000_000;
  sala = nova(true); // 1 contra 1 puro; os testes que precisam de bots criam a sala deles
});

type Entrada = { canal: CanalFalso; j: Jogador };

function entrar(apelido: string, lado?: "casa" | "visitante" | "tanto"): Entrada {
  const canal = new CanalFalso();
  const r = sala.entrarControle(canal, apelido);
  if (!r.ok) throw new Error(r.codigo);
  if (lado) sala.tratarControle(r.valor, { t: "lado", lado });
  return { canal, j: r.valor };
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

/** Avança o relógio e roda o laço como o servidor faz (acorda a cada 8 ms). */
function passarTempo(ms: number): void {
  for (let i = 0; i < ms; i += 8) {
    tempo += 8;
    sala.avancar();
  }
}

const cmd = (extra: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): Uint8Array => {
  const { dirRad, forca01, ...resto } = extra;
  return codificarComando({ ...comandoParado(), ang: anguloParaByte(dirRad ?? 0), mag: magParaByte(forca01 ?? 0), ...resto });
};

/** Ana (líder, Casa) e Beto (Visitante), com a partida já na bola rolando. */
function partidaRolando(): { a: Entrada; b: Entrada; pc: ReturnType<typeof telaMestre> } {
  const pc = telaMestre();
  const a = entrar("Ana", "casa");
  const b = entrar("Beto", "visitante");
  sala.tratarControle(a.j, { t: "comecar" });
  passarTempo(7000); // pré-jogo e saída de bola
  expect(sala.partida!.fase).toBe(FASE.jogo);
  return { a, b, pc };
}

const chutes = (c: CanalFalso): number => (c.ultimas("evento") as Evento[]).filter((e) => e.tipo === "chute").length;

describe("quem pausa e quem retoma", () => {
  it("o líder pausa pelo celular: o lobby de todos diz pausada e quem pausou", () => {
    const { a, b, pc } = partidaRolando();
    expect(a.canal.ultimoLobby()).toMatchObject({ emPartida: true, pausada: false });
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausadaPor");
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    for (const c of [a.canal, b.canal, pc.canal]) expect(c.ultimoLobby()).toMatchObject({ pausada: true, pausadaPor: "lider" });
  });

  it("o PC mestre pausa pelo telão", () => {
    const { a, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    expect(a.canal.ultimoLobby()).toMatchObject({ pausada: true, pausadaPor: "tela" });
    expect(pc.canal.ultimoErro()).toBeUndefined();
  });

  it("jogador comum e telão que só assiste recebem SEM_PERMISSAO e nada pausa", () => {
    const { b } = partidaRolando();
    const visitante = telaVisitante();
    sala.tratarControle(b.j, { t: "pausa", valor: true });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(visitante.tela, { t: "pausa", valor: true });
    expect(visitante.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(visitante.canal.fechadoCom).toBeNull();
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });

  it("pausa do líder: o líder e o PC retomam", () => {
    for (const quemRetoma of ["lider", "tela"] as const) {
      sala = nova(true);
      const { a, b, pc } = partidaRolando();
      sala.tratarControle(a.j, { t: "pausa", valor: true });
      if (quemRetoma === "lider") sala.tratarControle(a.j, { t: "pausa", valor: false });
      else sala.tratarTela(pc.tela, { t: "pausa", valor: false });
      expect(b.canal.ultimoLobby().pausada, quemRetoma).toBe(false);
      expect(a.canal.ultimoErro()).toBeUndefined();
    }
  });

  it("pausa do PC: só o PC retoma; o líder recebe PAUSA_DO_TELAO (que não é fatal) e o jogo continua pausado", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    expect(a.canal.ultimoErro()).toBe("PAUSA_DO_TELAO");
    expect(a.canal.fechadoCom).toBeNull();
    expect(b.canal.ultimoLobby()).toMatchObject({ pausada: true, pausadaPor: "tela" });
    sala.tratarTela(pc.tela, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });

  it("o líder não passa por cima da pausa do PC nem pausando de novo: pausar o que já está pausado não muda quem pausou", () => {
    const { a, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    expect(a.canal.ultimoLobby()).toMatchObject({ pausada: true, pausadaPor: "tela" });
  });

  it("repetir não faz nada: pausar de novo ou retomar o que não está pausado não dá erro nem manda outro lobby", () => {
    const { a, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: false }); // não está pausado
    const lobbies = a.canal.ultimas("lobby").length;
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    const depoisDeUma = a.canal.ultimas("lobby").length;
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    expect(a.canal.ultimas("lobby").length).toBe(depoisDeUma);
    expect(depoisDeUma).toBe(lobbies + 1);
    expect(a.canal.ultimoErro()).toBeUndefined();
    expect(pc.canal.ultimoErro()).toBeUndefined();
  });

  it("sem partida (no lobby) ou com a partida acabada, pausar é ignorado, sem erro", () => {
    const pc = telaMestre();
    const a = entrar("Ana", "casa");
    entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    expect(a.canal.ultimoLobby().pausada).toBe(false);
    expect(a.canal.ultimoErro()).toBeUndefined();

    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000);
    sala.partida!.definirRelogioParaTeste(1);
    passarTempo(4000);
    expect(sala.partida!.terminou).toBe(true);
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    expect(a.canal.ultimoLobby().pausada).toBe(false);
    expect(a.canal.ultimoErro()).toBeUndefined();
  });
});

describe("o jogo para de verdade", () => {
  it("parado, o tick, o tempo e o relógio da partida não andam, e não sai snapshot nenhum", () => {
    const { a, pc } = partidaRolando();
    const p = sala.partida!;
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    const { tick, t, relogio } = { tick: p.tick, t: p.t, relogio: p.relogio };
    const binarias = pc.canal.binarias.length;

    passarTempo(10_000);

    expect(p.tick).toBe(tick);
    expect(p.t).toBe(t);
    expect(p.relogio).toBe(relogio);
    expect(pc.canal.binarias.length).toBe(binarias);
  });

  it("ao pausar sai um último snapshot, do tick em que parou, para o telão", () => {
    const { a, pc } = partidaRolando();
    const antes = pc.canal.binarias.length;
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    expect(pc.canal.binarias.length).toBe(antes + 1);
    expect(decodificarSnapshot(pc.canal.binarias.at(-1)!)!.tick).toBe(sala.partida!.tick);
  });

  it("os comandos chegam e ficam guardados, mas ninguém se mexe", () => {
    const { a, b } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    const p = sala.partida!;
    const antes = { x: p.jogador(b.j.slot!)!.corpo.x, z: p.jogador(b.j.slot!)!.corpo.z };
    sala.comandoControle(b.j, cmd({ dirRad: Math.PI / 2, forca01: 1 }));
    passarTempo(2000);
    expect(p.jogador(b.j.slot!)!.corpo.x).toBe(antes.x);
    expect(p.jogador(b.j.slot!)!.corpo.z).toBe(antes.z);
    // ...e o joystick que ele segura vale ao retomar
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    passarTempo(1000);
    expect(p.jogador(b.j.slot!)!.corpo.z).toBeLessThan(antes.z - 3);
  });

  it("retomar não dá rajada de passos: depois de 60 s parado o jogo anda 1 s por segundo de relógio, não 60 s de uma vez", () => {
    const { a } = partidaRolando();
    const p = sala.partida!;
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    passarTempo(60_000);
    const tick = p.tick;
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    passarTempo(1000);
    expect(p.tick - tick).toBeGreaterThan(50);
    expect(p.tick - tick).toBeLessThan(75);
  });

  it("depois de retomar os snapshots voltam a sair e o relógio da partida volta a andar", () => {
    const { a, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    passarTempo(2000);
    const binarias = pc.canal.binarias.length;
    const relogio = sala.partida!.relogio;
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    passarTempo(1000);
    expect(pc.canal.binarias.length).toBeGreaterThan(binarias + 20);
    expect(sala.partida!.relogio).toBeLessThan(relogio);
  });

  it("passoUnico com o jogo pausado não faz nada (quem chama direto, como os testes, também não passa por cima)", () => {
    const { a } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    const tick = sala.partida!.tick;
    sala.passoUnico();
    expect(sala.partida!.tick).toBe(tick);
  });
});

describe("o que foi apertado com o jogo parado não vale ao retomar", () => {
  it("o chute soltado durante a pausa é descartado: não sai chute e a bola continua com ele", () => {
    const { a } = partidaRolando();
    sala.posicionarParaTeste(a.j.id, 20, 0, 20.55, 0);
    passarTempo(200);
    sala.comandoControle(a.j, cmd({ seguros: BOTAO.chute })); // segurando CHUTE (carregando)
    passarTempo(400);
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.comandoControle(a.j, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 1 })); // soltou com o jogo parado
    passarTempo(500);
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    passarTempo(500);
    expect(chutes(a.canal)).toBe(0);
    expect(sala.partida!.dominante).toBe(a.j.slot);
  });

  it("um chute feito depois de retomar sai normalmente", () => {
    const { a } = partidaRolando();
    sala.posicionarParaTeste(a.j.id, 20, 0, 20.55, 0);
    passarTempo(200);
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    sala.comandoControle(a.j, cmd({ seguros: BOTAO.chute }));
    passarTempo(600);
    sala.comandoControle(a.j, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 1 }));
    passarTempo(100);
    expect(chutes(a.canal)).toBe(1);
  });

  it("CHUTE apertado na pausa, sem a bola, não vira troca de jogador ao retomar (a troca à mão é o CHUTE sem a bola)", () => {
    sala = nova(false); // com bots: há companheiros livres para onde a troca iria
    const a = entrar("Ana", "casa");
    entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000);
    // A bola solta a 4 m dele e os companheiros bots longe: sem a bola, o CHUTE dele é a troca à mão, e ela iria para um bot
    const p = sala.partida!;
    for (const j of p.jogadores) if (j.vaga.time === 0 && !j.vaga.goleiro && j.vaga.slot !== a.j.slot) p.posicionarParaTeste(j.vaga.slot, -20, (j.vaga.slot - 3) * 4, 4, 0, 0);
    sala.posicionarParaTeste(a.j.id, 0, 0, 4, 0);
    sala.comandoControle(a.j, cmd());
    passarTempo(100);
    expect(p.dominante).not.toBe(a.j.slot);
    const slot = p.slotDoHumano(a.j.id);
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.comandoControle(a.j, cmd({ seguros: BOTAO.chute }));
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    passarTempo(300);
    expect(sala.partida!.slotDoHumano(a.j.id)).toBe(slot);
  });
});

describe("entrar com a sala pausada", () => {
  it("o telão que entra (ou recarrega) recebe a partida, o lobby com a pausa e um snapshot do jogo parado", () => {
    const { a } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    const novoTelao = new CanalFalso();
    const r = sala.entrarTela(novoTelao);
    expect(r.ok).toBe(true);
    expect(novoTelao.ultimoLobby()).toMatchObject({ emPartida: true, pausada: true, pausadaPor: "lider" });
    expect(novoTelao.ultimas("partida")).toHaveLength(1);
    expect(novoTelao.binarias).toHaveLength(1);
    expect(decodificarSnapshot(novoTelao.binarias[0]!)!.tick).toBe(sala.partida!.tick);
    // E parado continua sem snapshot
    passarTempo(2000);
    expect(novoTelao.binarias).toHaveLength(1);
  });

  it("o celular que entra pausado, ou volta de uma queda, recebe a partida, o `voce` e o lobby com a pausa", () => {
    const { a, b } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });

    const depois = entrar("Dani"); // sem vaga (1 contra 1 puro): fica em espera
    expect(depois.canal.ultimoLobby()).toMatchObject({ pausada: true });
    expect(depois.canal.ultimas("partida")).toHaveLength(1);
    expect((depois.canal.ultimas("voce")[0] as Voce).situacao).toBe("espera");

    sala.desconectarControle(b.j, b.canal);
    const volta = new CanalFalso();
    expect(sala.entrarControle(volta, "Beto", b.j.token).ok).toBe(true);
    expect(volta.ultimoLobby()).toMatchObject({ pausada: true, pausadaPor: "lider" });
    expect((volta.ultimas("partida")[0] as PartidaMsg).elenco.length).toBeGreaterThan(0);
    expect((volta.ultimas("voce").at(-1) as Voce).slot).toBe(b.j.slot); // volta com o jogador dele (já valia antes da pausa)
  });
});

describe("a pausa e o resto da sala", () => {
  it("voltar ao lobby limpa a pausa, e a próxima partida nasce rodando", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarControle(a.j, { t: "lobby" });
    expect(sala.partida).toBeNull();
    expect(b.canal.ultimoLobby()).toMatchObject({ emPartida: false, pausada: false });
    expect(b.canal.ultimoLobby()).not.toHaveProperty("pausadaPor");

    sala.tratarControle(a.j, { t: "comecar" });
    expect(pc.canal.ultimoLobby().pausada).toBe(false);
    const tick = sala.partida!.tick;
    passarTempo(1000);
    expect(sala.partida!.tick).toBeGreaterThan(tick);
  });

  it("o PC volta ao lobby com a partida pausada pelo líder, e a pausa some", () => {
    const { a, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "lobby" });
    expect(a.canal.ultimoLobby()).toMatchObject({ emPartida: false, pausada: false });
  });

  // (A vaga guardada de quem cai NÃO vence com o jogo pausado desde a H7.4a: ver `sala.pausa-prazos.test.ts`.)

  it("expulsar com o jogo pausado funciona, e o jogo continua pausado", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "expulsar", id: b.j.id });
    expect(b.canal.fechadoCom).toBe(4005);
    expect(a.canal.ultimoLobby()).toMatchObject({ pausada: true });
    expect(sala.partida!.slotDoHumano(b.j.id)).toBeNull();
  });

  it("se o líder que pausou sai, a pausa continua (quem retoma é o PC ou o novo líder)", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "expulsar", id: a.j.id });
    expect(b.canal.ultimoLobby().pausada).toBe(true);
    sala.tratarTela(pc.tela, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });
});
