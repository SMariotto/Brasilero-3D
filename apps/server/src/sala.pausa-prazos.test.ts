import { beforeEach, describe, expect, it } from "vitest";
import { FASE } from "@b3d/core";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador, type Tela } from "./sala";

// H7.4a: o que a pausa faz com os PRAZOS da sala.
//  1) A vaga guardada (30 s) e a escolha do líder pelo PC (15 s) não correm com a partida pausada (senão um celular que dorme numa pausa
//     longa perderia a vaga, ou a liderança, por causa da pausa).
//  2) Pausa do PC que ninguém retoma: com o PC 30 s sem sinal, o líder também pode retomar.
//  3) Como os prazos de (1) ficam parados, uma pausa sem ninguém que possa retomá-la (sem PC e sem o líder conectados) acaba sozinha em 30 s.

let tempo = 0;
let contadorToken = 0;
const agora = () => tempo;
let sala: Sala;

function nova(): Sala {
  contadorToken = 0;
  return new Sala("ABCD", agora, () => `token${contadorToken++}`, { semente: () => 42, semBots: true, gerarChave: () => "chave-do-pc" });
}

beforeEach(() => {
  tempo = 5_000_000;
  sala = nova();
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

/** O PC volta (recarregou a página): entra com a chave que o navegador guardou. */
function telaMestreVolta(): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal, { chave: "chave-do-pc" });
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

function passarTempo(ms: number): void {
  for (let i = 0; i < ms; i += 8) {
    tempo += 8;
    sala.avancar();
  }
}

/** Passa `s` segundos como o servidor faz: `varrer` a cada segundo. */
function varrerPor(s: number): void {
  for (let i = 0; i < s; i++) {
    tempo += 1000;
    sala.varrer();
  }
}

/** Ana (líder, Casa) e Beto (Visitante), com a partida já na bola rolando. */
function partidaRolando(): { a: Entrada; b: Entrada; pc: ReturnType<typeof telaMestre> } {
  const pc = telaMestre();
  const a = entrar("Ana", "casa");
  const b = entrar("Beto", "visitante");
  sala.tratarControle(a.j, { t: "comecar" });
  passarTempo(7000);
  expect(sala.partida!.fase).toBe(FASE.jogo);
  return { a, b, pc };
}

const pausar = (a: Entrada) => sala.tratarControle(a.j, { t: "pausa", valor: true });
const retomar = (a: Entrada) => sala.tratarControle(a.j, { t: "pausa", valor: false });

describe("a vaga guardada (30 s) não corre com a partida pausada", () => {
  it("pausa longa: quem caiu antes de pausar continua com a vaga, e o jogo não vira bot", () => {
    const { a, b } = partidaRolando();
    sala.desconectarControle(b.j, b.canal);
    pausar(a);
    tempo += 10 * 60_000; // dez minutos pausado
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2);
    expect(sala.partida!.slotDoHumano(b.j.id)).toBe(b.j.slot); // continua dele (ausente, mas dele)

    // Volta a conectar com o token no meio da pausa: a mesma vaga
    const volta = new CanalFalso();
    expect(sala.entrarControle(volta, "Beto", b.j.token).ok).toBe(true);
    expect(volta.ultimoLobby()).toMatchObject({ pausada: true });
  });

  it("ao retomar, a vaga ainda tem os 30 s inteiros que tinha: 29 s depois continua, 31 s depois venceu", () => {
    const { a, b } = partidaRolando();
    const slot = b.j.slot!;
    sala.desconectarControle(b.j, b.canal);
    pausar(a);
    tempo += 10 * 60_000;
    retomar(a);
    varrerPor(29);
    expect(sala.quantidadeJogadores).toBe(2);
    varrerPor(2);
    expect(sala.quantidadeJogadores).toBe(1);
    expect(sala.partida!.slotDoHumano(b.j.id)).toBeNull(); // o bot ficou com o lugar
    expect(sala.partida!.jogador(slot)!.vaga.humano).toBe(false);
  });

  it("o que a vaga já tinha corrido antes da pausa conta: 20 s antes + 9 s depois = 29 s (ainda tem); 31 s no total vence", () => {
    const { a, b } = partidaRolando();
    sala.desconectarControle(b.j, b.canal);
    tempo += 20_000;
    pausar(a);
    tempo += 5 * 60_000;
    retomar(a);
    varrerPor(9);
    expect(sala.quantidadeJogadores).toBe(2);
    varrerPor(2);
    expect(sala.quantidadeJogadores).toBe(1);
  });

  it("quem cai DURANTE a pausa começa a contar os 30 s só quando o jogo retoma", () => {
    const { a, b } = partidaRolando();
    pausar(a);
    sala.desconectarControle(b.j, b.canal);
    tempo += 3 * 60_000;
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2);
    retomar(a);
    varrerPor(29);
    expect(sala.quantidadeJogadores).toBe(2);
    varrerPor(2);
    expect(sala.quantidadeJogadores).toBe(1);
  });

  it("duas pausas seguidas: o tempo parado das duas sai da conta", () => {
    const { a, b } = partidaRolando();
    sala.desconectarControle(b.j, b.canal);
    pausar(a);
    tempo += 60_000;
    retomar(a);
    varrerPor(10);
    pausar(a);
    tempo += 60_000;
    retomar(a);
    varrerPor(19); // 10 + 19 = 29 s rodando
    expect(sala.quantidadeJogadores).toBe(2);
    varrerPor(2);
    expect(sala.quantidadeJogadores).toBe(1);
  });

  it("acabar a partida (voltar ao lobby) com o jogo pausado: o relógio da sala volta a andar, sem contar o tempo parado", () => {
    const { a, b } = partidaRolando();
    sala.desconectarControle(b.j, b.canal);
    pausar(a);
    tempo += 10 * 60_000;
    sala.tratarControle(a.j, { t: "lobby" });
    expect(sala.partida).toBeNull();
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2); // os 10 minutos pausados não contaram
    varrerPor(31);
    expect(sala.quantidadeJogadores).toBe(1);
  });

  it("sem pausa nada mudou: a vaga vence nos 30 s de sempre", () => {
    const { b } = partidaRolando();
    sala.desconectarControle(b.j, b.canal);
    varrerPor(29);
    expect(sala.quantidadeJogadores).toBe(2);
    varrerPor(2);
    expect(sala.quantidadeJogadores).toBe(1);
  });
});

describe("a escolha do líder pelo PC (15 s) não corre com a partida pausada", () => {
  it("o PC expulsa o líder, pausa, espera uma eternidade: ninguém assume; ao retomar o prazo continua de onde parou", () => {
    const { a, b, pc } = partidaRolando();
    const c = entrar("Caio"); // um terceiro celular, para sobrar candidato
    sala.tratarTela(pc.tela, { t: "expulsar", id: a.j.id });
    expect(sala.esperandoLider).toBe(true);
    tempo += 5000;
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    tempo += 10 * 60_000;
    sala.varrer();
    expect(sala.esperandoLider).toBe(true);
    expect(sala.donoId()).toBeNull();
    expect(b.canal.ultimoLobby().jogadores.some((j) => j.dono)).toBe(false);

    sala.tratarTela(pc.tela, { t: "pausa", valor: false });
    varrerPor(9); // 5 + 9 = 14 s correndo
    expect(sala.donoId()).toBeNull();
    varrerPor(2); // 16 s: o mais antigo conectado assume
    expect(sala.donoId()).toBe(b.j.id);
    expect(c.j.id).not.toBe(sala.donoId());
  });

  it("o PC escolhe o líder com o jogo pausado: vale na hora", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "lider", id: b.j.id });
    expect(sala.donoId()).toBe(b.j.id);
    expect(a.canal.ultimoLobby().jogadores.find((j) => j.id === b.j.id)!.dono).toBe(true);
  });

  it("se o PC sai enquanto a sala espera o líder, o celular mais antigo assume na hora, mesmo pausado (não é prazo)", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.tratarTela(pc.tela, { t: "expulsar", id: a.j.id });
    expect(sala.esperandoLider).toBe(true);
    sala.sairTela(pc.tela);
    sala.varrer();
    expect(sala.donoId()).toBe(b.j.id);
    expect(sala.esperandoLider).toBe(false);
  });

  it("o líder que pausou cai: a vaga dele fica parada e o PC retoma quando quiser", () => {
    const { a, b, pc } = partidaRolando();
    pausar(a);
    sala.desconectarControle(a.j, a.canal);
    varrerPor(120);
    expect(sala.donoId()).toBe(a.j.id);
    sala.tratarControle(b.j, { t: "pausa", valor: false });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO"); // quem não é líder nunca retoma
    sala.tratarTela(pc.tela, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });
});

describe("pausa do PC que ninguém retoma: o líder retoma depois de 30 s sem o PC", () => {
  it("antes dos 30 s o líder continua recebendo PAUSA_DO_TELAO; aos 30 s o lobby avisa e ele retoma", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    varrerPor(29);
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    expect(a.canal.ultimoErro()).toBe("PAUSA_DO_TELAO");
    expect(b.canal.ultimoLobby().pausada).toBe(true);

    varrerPor(1); // 30 s sem o PC
    expect(a.canal.ultimoLobby()).toMatchObject({ pausada: true, pausadaPor: "tela", pausaSemPc: true });
    expect(b.canal.ultimoLobby()).toMatchObject({ pausaSemPc: true });
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
    expect(b.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
    expect(a.canal.ultimas("erro").filter((e) => e.codigo === "PAUSA_DO_TELAO")).toHaveLength(1);
  });

  it("só o líder ganha o direito: jogador comum continua sem poder pausar nem retomar", () => {
    const { b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    varrerPor(60);
    sala.tratarControle(b.j, { t: "pausa", valor: false });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(b.canal.ultimoLobby().pausada).toBe(true);
  });

  it("o aviso do lobby sai uma vez só (varrer de novo não repete o lobby)", () => {
    const { a, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    varrerPor(30);
    const lobbies = a.canal.ultimas("lobby").length;
    varrerPor(5);
    expect(a.canal.ultimas("lobby").length).toBe(lobbies);
  });

  it("o PC volta: o líder perde o direito de novo (pausaSemPc some) e o prazo recomeça se ele sair outra vez", () => {
    const { a, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    varrerPor(31);
    expect(a.canal.ultimoLobby().pausaSemPc).toBe(true);

    const volta = telaMestreVolta();
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
    expect(a.canal.ultimoLobby().pausada).toBe(true);
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    expect(a.canal.ultimoErro()).toBe("PAUSA_DO_TELAO");

    // O PC cai outra vez: a contagem é dos 30 s desta vez, não dos de antes
    sala.sairTela(volta.tela);
    varrerPor(29);
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
    varrerPor(1);
    expect(a.canal.ultimoLobby().pausaSemPc).toBe(true);
  });

  it("o PC volta e retoma pela chave: tudo normal", () => {
    const { b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    varrerPor(40);
    const volta = telaMestreVolta();
    sala.tratarTela(volta.tela, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });

  it("telão que só assiste não conta como PC: com ele conectado, o PC continua sem sinal", () => {
    const { a, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    telaVisitante();
    varrerPor(30);
    expect(a.canal.ultimoLobby().pausaSemPc).toBe(true);
  });

  it("outro telão mestre conectado (outra aba do PC) mantém o PC presente", () => {
    const { a, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    telaMestreVolta(); // outra aba com a chave
    sala.sairTela(pc.tela);
    varrerPor(60);
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    expect(a.canal.ultimoErro()).toBe("PAUSA_DO_TELAO");
  });

  it("pausa do líder: o PC fora não muda nada (pausaSemPc nunca aparece) e o líder retoma como sempre", () => {
    const { a, pc } = partidaRolando();
    pausar(a);
    sala.sairTela(pc.tela);
    varrerPor(120);
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
    retomar(a);
    expect(a.canal.ultimoLobby().pausada).toBe(false);
    expect(a.canal.ultimoErro()).toBeUndefined();
  });

  it("sem pausa, o PC fora por muito tempo não deixa rastro: pausar depois não nasce 'sem PC'", () => {
    const { a, pc } = partidaRolando();
    sala.sairTela(pc.tela);
    varrerPor(120);
    const volta = telaMestreVolta();
    sala.tratarTela(volta.tela, { t: "pausa", valor: true });
    expect(a.canal.ultimoLobby()).not.toHaveProperty("pausaSemPc");
  });
});

describe("pausa sem ninguém para retomar: acaba sozinha em 30 s", () => {
  it("nem o PC nem o líder conectados: depois de 30 s a partida retoma e todos são avisados", () => {
    const { a, b, pc } = partidaRolando();
    const tick = sala.partida!.tick;
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    sala.desconectarControle(a.j, a.canal); // o líder cai
    varrerPor(29);
    expect(b.canal.ultimoLobby().pausada).toBe(true);
    varrerPor(3);
    expect(b.canal.ultimoLobby().pausada).toBe(false);
    expect(b.canal.ultimas("aviso").at(-1)!.texto).toMatch(/continuou/);
    passarTempo(1000);
    expect(sala.partida!.tick).toBeGreaterThan(tick);
  });

  it("depois de retomar, a vaga do líder (parada na pausa) segue de onde estava e a liderança passa", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    sala.desconectarControle(a.j, a.canal);
    varrerPor(32); // retomou sozinha
    expect(b.canal.ultimoLobby().pausada).toBe(false);
    expect(sala.quantidadeJogadores).toBe(2); // a vaga da Ana ainda tem os 30 s: ficou parada na pausa
    varrerPor(31);
    expect(sala.quantidadeJogadores).toBe(1);
    expect(sala.donoId()).toBe(b.j.id); // sem PC, o celular conectado assume na hora
  });

  it("o PC conectado evita: com o líder fora, a pausa e a vaga dele ficam paradas por quanto tempo for", () => {
    const { a, b, pc } = partidaRolando();
    sala.desconectarControle(a.j, a.canal);
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    varrerPor(300);
    expect(b.canal.ultimoLobby().pausada).toBe(true);
    expect(sala.quantidadeJogadores).toBe(2);
    sala.tratarTela(pc.tela, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });

  it("o líder conectado evita: com o PC fora, a pausa do PC espera o líder (que retoma depois dos 30 s)", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    varrerPor(300);
    expect(b.canal.ultimoLobby().pausada).toBe(true);
    sala.tratarControle(a.j, { t: "pausa", valor: false });
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });

  it("a contagem recomeça se o PC (ou o líder) volta antes dos 30 s", () => {
    const { a, b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "pausa", valor: true });
    sala.sairTela(pc.tela);
    sala.desconectarControle(a.j, a.canal);
    varrerPor(20);
    const volta = telaMestreVolta(); // o PC volta
    varrerPor(20);
    expect(b.canal.ultimoLobby().pausada).toBe(true);
    sala.sairTela(volta.tela); // e cai de novo: outra contagem de 30 s
    varrerPor(25);
    expect(b.canal.ultimoLobby().pausada).toBe(true);
    varrerPor(8);
    expect(b.canal.ultimoLobby().pausada).toBe(false);
  });

  it("sem pausa a regra não faz nada: PC e líder fora por muito tempo não mexem em partida rolando", () => {
    const { a, b, pc } = partidaRolando();
    sala.sairTela(pc.tela);
    sala.desconectarControle(a.j, a.canal);
    varrerPor(20);
    expect(b.canal.ultimas("aviso").some((m) => /continuou/.test(m.texto))).toBe(false);
  });
});

describe("acabar a partida (a mensagem `lobby`) no meio do jogo", () => {
  it("o líder acaba a partida rolando: volta ao lobby com os lados e apelidos, sem registrar resultado no campeonato", () => {
    const { a, b } = partidaRolando();
    sala.tratarControle(a.j, { t: "lobby" });
    expect(sala.partida).toBeNull();
    expect(sala.campeonato.partidas).toBe(0);
    const l = b.canal.ultimoLobby();
    expect(l).toMatchObject({ emPartida: false, pausada: false });
    expect(l.jogadores.map((j) => [j.apelido, j.lado])).toEqual([
      ["Ana", "casa"],
      ["Beto", "visitante"],
    ]);
    expect(a.j.time).toBeNull();
    expect(a.j.slot).toBeNull();
  });

  it("o PC acaba a partida pelo telão", () => {
    const { b, pc } = partidaRolando();
    sala.tratarTela(pc.tela, { t: "lobby" });
    expect(sala.partida).toBeNull();
    expect(b.canal.ultimoLobby().emPartida).toBe(false);
    expect(pc.canal.ultimoErro()).toBeUndefined();
  });

  it("jogador comum e telão que só assiste não acabam a partida", () => {
    const { b } = partidaRolando();
    const visitante = telaVisitante();
    sala.tratarControle(b.j, { t: "lobby" });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(visitante.tela, { t: "lobby" });
    expect(visitante.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.partida).not.toBeNull();
  });

  it("duas pessoas pedindo ao mesmo tempo: o segundo pedido não dá erro nem derruba nada", () => {
    const { a, pc } = partidaRolando();
    sala.tratarControle(a.j, { t: "lobby" });
    sala.tratarTela(pc.tela, { t: "lobby" });
    expect(a.canal.ultimoErro()).toBeUndefined();
    expect(pc.canal.ultimoErro()).toBeUndefined();
    expect(sala.partida).toBeNull();
  });

  it("depois de acabar, dá para começar outra partida normalmente (nasce rodando, sem miras velhas)", () => {
    const { a } = partidaRolando();
    sala.tratarControle(a.j, { t: "lobby" });
    sala.tratarControle(a.j, { t: "comecar" });
    const tick = sala.partida!.tick;
    passarTempo(1000);
    expect(sala.partida!.tick).toBeGreaterThan(tick);
  });
});
