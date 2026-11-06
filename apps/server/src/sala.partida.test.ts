import { beforeEach, describe, expect, it } from "vitest";
import {
  ACAO,
  BOTAO,
  FASE,
  anguloParaByte,
  codificarComando,
  comandoParado,
  decodificarSnapshot,
  magParaByte,
  type Comando,
  type Evento,
  type Fim,
  type PartidaMsg,
  type Voce,
} from "@b3d/core";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador } from "./sala";

let tempo = 0;
const agora = () => tempo;
let sala: Sala;

beforeEach(() => {
  tempo = 5_000_000;
  let n = 0;
  sala = new Sala("ABCD", agora, () => `tk${n++}`, { semente: () => 42, semBots: true }); // 1 contra 1 puro; os bots têm o describe de baixo
});

function entrar(apelido: string, lado?: "casa" | "visitante" | "tanto"): { canal: CanalFalso; j: Jogador } {
  const canal = new CanalFalso();
  const r = sala.entrarControle(canal, apelido);
  if (!r.ok) throw new Error(r.codigo);
  if (lado) sala.tratarControle(r.valor, { t: "lado", lado });
  return { canal, j: r.valor };
}

function tela(): CanalFalso {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal);
  if (!r.ok) throw new Error(r.codigo);
  return canal;
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

describe("começar a partida", () => {
  it("só o Dono começa; quem começa manda `partida` e `voce` a todos e o lobby passa a dizer emPartida", () => {
    const t = tela();
    const a = entrar("Ana", "casa");
    const b = entrar("Beto", "visitante");

    sala.tratarControle(b.j, { t: "comecar" });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.partida).toBeNull();

    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida).not.toBeNull();
    for (const c of [t, a.canal, b.canal]) {
      const p = c.ultimas("partida");
      expect(p).toHaveLength(1);
    }
    const p = t.ultimas("partida")[0] as PartidaMsg;
    expect(p.tickHz).toBe(60);
    expect(p.snapHz).toBe(30);
    expect(p.campo).toMatchObject({ comp: 60, larg: 38, golLarg: 6, golAlt: 2.2, areaComp: 8, areaLarg: 12, paredes: false });
    expect(p.cores).toEqual(["#C8102E", "#006437"]); // Flamengo x Palmeiras
    expect(p.elenco.map((v) => [v.slot, v.time, v.nome, v.humano, v.idControle])).toEqual([
      [1, 0, "Ana", true, 0],
      [7, 1, "Beto", true, 1],
    ]);
    expect(t.ultimoLobby().emPartida).toBe(true);

    const vozA = a.canal.ultimas("voce")[0] as Voce;
    expect(vozA).toMatchObject({ slot: 1, time: 0, numero: 7, cor: "#C8102E", comBola: false, situacao: "normal" });
    expect((b.canal.ultimas("voce")[0] as Voce).slot).toBe(7);
  });

  it("o modo que o Dono escolheu vale (Campo ou Arena)", () => {
    const t = tela();
    const a = entrar("Ana", "casa");
    entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "config", modo: "arena" });
    sala.tratarControle(a.j, { t: "comecar" });
    expect((t.ultimas("partida")[0] as PartidaMsg).config.modo).toBe("arena");
    expect(sala.partida!.campo.paredes).toBe(true);
    sala.tratarControle(a.j, { t: "lobby" });
    sala.tratarControle(a.j, { t: "config", modo: "campo" });
    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida!.config.modo).toBe("campo");
    expect(sala.partida!.campo.paredes).toBe(false);
  });

  it("'tanto faz' equilibra os lados", () => {
    const todos = ["A", "B", "C", "D"].map((n) => entrar(n, "tanto"));
    sala.tratarControle(todos[0]!.j, { t: "comecar" });
    const times = sala.partida!.jogadores.map((j) => j.vaga.time);
    expect(times.filter((x) => x === 0)).toHaveLength(2);
    expect(times.filter((x) => x === 1)).toHaveLength(2);
  });

  it("quem escolheu lado fica no lado e 'tanto faz' completa o menor", () => {
    const a = entrar("A", "casa");
    entrar("B", "casa");
    const c = entrar("C", "tanto");
    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida!.jogador(c.j.slot!)!.vaga.time).toBe(1);
  });

  it("slots: Casa usa 1 a 5 e Visitante 7 a 11 (0 e 6 são dos goleiros)", () => {
    const casa = ["A", "B", "C"].map((n) => entrar(n, "casa"));
    const vis = ["D", "E"].map((n) => entrar(n, "visitante"));
    sala.tratarControle(casa[0]!.j, { t: "comecar" });
    expect(casa.map((c) => c.j.slot)).toEqual([1, 2, 3]);
    expect(vis.map((c) => c.j.slot)).toEqual([7, 8]);
  });

  it("com 3 humanos num time e N = 3, todos cabem: N é o que o Dono escolheu (G1: máximo de 3 por time)", () => {
    const a = entrar("A", "casa");
    sala.tratarControle(a.j, { t: "config", n: 3 });
    for (const n of ["B", "C"]) entrar(n, "casa");
    entrar("E", "visitante");
    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida!.config.n).toBe(3);
    expect(sala.partida!.campo.comp).toBe(44);
    expect(sala.partida!.jogadores.filter((j) => j.vaga.time === 0 && j.vaga.humano)).toHaveLength(3);
  });

  it("durante a partida, mudar config, lado e pronto é recusado", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    sala.tratarControle(a.j, { t: "config", n: 3 });
    expect(a.canal.ultimoErro()).toBe("MENSAGEM_INVALIDA");
    sala.tratarControle(a.j, { t: "lado", lado: "visitante" });
    sala.tratarControle(a.j, { t: "pronto", valor: true });
    expect(a.j.lado).toBe("casa");
    expect(a.j.pronto).toBe(false);
    expect(sala.config.n).toBe(5);
  });

  it("um segundo Começar enquanto a partida roda não cria outra", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    const p = sala.partida;
    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida).toBe(p);
  });
});

describe("laço de jogo", () => {
  it("1 s de relógio gera 60 passos e 30 snapshots binários para cada telão", () => {
    const t = tela();
    const t2 = tela();
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(8); // primeira volta só marca o relógio
    const base = sala.partida!.tick;
    passarTempo(1000);
    const passos = sala.partida!.tick - base;
    expect(passos).toBeGreaterThanOrEqual(58);
    expect(passos).toBeLessThanOrEqual(62);
    for (const c of [t, t2]) {
      expect(c.binarias.length).toBeGreaterThanOrEqual(29);
      expect(c.binarias.length).toBeLessThanOrEqual(32);
      const s = decodificarSnapshot(c.binarias[0]!);
      expect(s).not.toBeNull();
      expect(s!.fase).toBe(FASE.preJogo);
      expect(s!.jogadores).toHaveLength(1);
    }
  });

  it("controle não recebe snapshot binário (só telão)", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(500);
    expect(a.canal.binarias).toHaveLength(0);
  });

  it("no máximo 5 passos por volta, e o atraso grande não acelera o jogo", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    sala.avancar();
    tempo += 5000; // o PC engasgou 5 s
    sala.avancar();
    expect(sala.partida!.tick).toBe(5);
    sala.avancar(); // sem tempo novo: nada roda
    expect(sala.partida!.tick).toBe(5);
  });

  it("sem partida o laço não faz nada", () => {
    entrar("Ana");
    expect(sala.avancar()).toBe(0);
  });

  it("os eventos do jogo vão como JSON, com o tick, para telões e controles", () => {
    const t = tela();
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(3300);
    for (const c of [t, a.canal]) {
      const ev = c.ultimas("evento") as Evento[];
      expect(ev.map((e) => e.tipo)).toEqual(["apito", "saida"]);
      expect(ev[0]).toMatchObject({ tipo: "apito", dados: { motivo: "inicio" } });
      expect(ev[1]).toMatchObject({ tipo: "saida", dados: { time: 0 } });
      expect(ev[0]!.tick).toBeGreaterThan(150);
    }
  });

  it("o laço informa o tempo do passo mais lento (ms)", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    sala.avancar();
    tempo += 100;
    const pior = sala.avancar();
    expect(pior).toBeGreaterThan(0);
    expect(pior).toBeLessThan(50);
  });
});

describe("comandos do controle", () => {
  it("o comando binário chega ao jogador certo e ele se mexe", () => {
    const a = entrar("Ana", "casa");
    const b = entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000); // pré-jogo e saída
    expect(sala.partida!.fase).toBe(FASE.jogo);
    const antes = sala.partida!.jogador(b.j.slot!)!.corpo.z;
    sala.comandoControle(b.j, cmd({ dirRad: Math.PI / 2, forca01: 1 })); // cima do celular = -Z
    passarTempo(1000);
    expect(sala.partida!.jogador(b.j.slot!)!.corpo.z).toBeLessThan(antes - 3);
    expect(sala.partida!.jogador(a.j.slot!)!.corpo.vx).toBeCloseTo(0, 5);
  });

  it("comando quebrado, de tamanho errado ou de quem está de fora é ignorado", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    const de = entrar("Depois"); // entrou com a partida rolando: sem slot
    expect(de.j.slot).toBeNull();
    passarTempo(7000);
    const x = sala.partida!.jogador(a.j.slot!)!.corpo.x;
    sala.comandoControle(a.j, new Uint8Array([1, 0, 255]));
    sala.comandoControle(a.j, new Uint8Array(7));
    sala.comandoControle(de.j, cmd({ dirRad: 0, forca01: 1 }));
    passarTempo(500);
    expect(Math.abs(sala.partida!.jogador(a.j.slot!)!.corpo.x - x)).toBeLessThan(0.5);
    expect(sala.partida!.jogadores).toHaveLength(1);
  });

  it("sem partida o comando é ignorado", () => {
    const a = entrar("Ana");
    sala.comandoControle(a.j, cmd({ dirRad: 0, forca01: 1 }));
    expect(sala.partida).toBeNull();
  });

  it("chute pelo comando binário muda a bola e manda o evento de chute", () => {
    const t = tela();
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000);
    sala.posicionarParaTeste(a.j.id, 20, 0, 20.55, 0);
    passarTempo(200);
    sala.comandoControle(a.j, cmd({ seguros: BOTAO.chute }));
    passarTempo(800);
    sala.comandoControle(a.j, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 1 }));
    passarTempo(100);
    const ev = (t.ultimas("evento") as Evento[]).find((e) => e.tipo === "chute");
    expect(ev).toMatchObject({ dados: { slot: 1, forca: 1 } });
    passarTempo(1500);
    expect(sala.partida!.placar).toEqual([1, 0]);
    const gol = (t.ultimas("evento") as Evento[]).find((e) => e.tipo === "gol");
    expect(gol).toMatchObject({ dados: { time: 0, slot: 1, contra: false, placar: [1, 0] } });
  });
});

describe("voce", () => {
  it("H3: sem stamina, correr não faz o `voce` mudar a cada passo (no máximo 10 por segundo, e quase nada com o jogador só correndo)", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000);
    const antes = a.canal.ultimas("voce").length;
    sala.comandoControle(a.j, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.passe }));
    passarTempo(1000);
    const novas = a.canal.ultimas("voce").length - antes;
    expect(novas).toBeLessThanOrEqual(11);
  });

  it("parado, manda um por segundo (sinal de vida)", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000);
    const antes = a.canal.ultimas("voce").length;
    passarTempo(3000);
    const novas = a.canal.ultimas("voce").length - antes;
    expect(novas).toBeGreaterThanOrEqual(2);
    expect(novas).toBeLessThanOrEqual(4);
  });

  it("quem entra com a partida rolando recebe `voce` em espera", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    const de = entrar("Depois");
    expect(de.canal.ultimas("partida")).toHaveLength(1);
    expect(de.canal.ultimas("voce")[0]).toMatchObject({ slot: -1, situacao: "espera" });
  });
});

describe("entrar e reconectar com a partida rolando", () => {
  it("telão que chega depois recebe a partida e passa a receber snapshots", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    const tardio = tela();
    expect(tardio.ultimas("partida")).toHaveLength(1);
    passarTempo(500);
    expect(tardio.binarias.length).toBeGreaterThan(10);
  });

  it("o controle que cai e volta com o token recebe a partida e o mesmo slot", () => {
    const a = entrar("Ana", "casa");
    const b = entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "comecar" });
    const slot = b.j.slot;
    sala.desconectarControle(b.j, b.canal);
    passarTempo(2000);
    const novo = new CanalFalso();
    const r = sala.entrarControle(novo, "Beto", b.j.token);
    expect(r.ok).toBe(true);
    expect(novo.ultimas("partida")).toHaveLength(1);
    expect(novo.ultimas("voce")[0]).toMatchObject({ slot, situacao: "normal" });
    // E volta a comandar o mesmo jogador
    passarTempo(6000);
    const z = sala.partida!.jogador(slot!)!.corpo.z;
    sala.comandoControle(b.j, cmd({ dirRad: Math.PI / 2, forca01: 1 }));
    passarTempo(500);
    expect(sala.partida!.jogador(slot!)!.corpo.z).toBeLessThan(z - 1);
  });
});

describe("fim, revanche e lobby", () => {
  function jogoAcabado(): { t: CanalFalso; a: { canal: CanalFalso; j: Jogador }; b: { canal: CanalFalso; j: Jogador } } {
    const t = tela();
    const a = entrar("Ana", "casa");
    const b = entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "config", duracao: 2 });
    sala.tratarControle(a.j, { t: "comecar" });
    // 2 min de jogo corrido + pré-jogo e saída, em passos de 16 ms
    for (let i = 0; i < 130_000 / 16 && !sala.partida!.terminou; i++) {
      tempo += 16;
      sala.avancar();
    }
    return { t, a, b };
  }

  it("quando o relógio zera: evento de fim, mensagem `fim` uma vez só, e o laço para", () => {
    const { t, a } = jogoAcabado();
    expect(sala.partida!.terminou).toBe(true);
    for (const c of [t, a.canal]) {
      expect((c.ultimas("evento") as Evento[]).filter((e) => e.tipo === "fim")).toHaveLength(1);
      expect(c.ultimas("fim")).toHaveLength(1);
    }
    const f = t.ultimas("fim")[0] as Fim;
    expect(f).toMatchObject({ placar: [0, 0], gols: [], destaques: { artilheiro: null } });

    const tick = sala.partida!.tick;
    const binarias = t.binarias.length;
    passarTempo(2000);
    expect(sala.partida!.tick).toBe(tick);
    expect(t.binarias.length).toBe(binarias);
    // O último snapshot mostra a fase de fim
    expect(decodificarSnapshot(t.binarias[t.binarias.length - 1]!)!.fase).toBe(FASE.fim);
  });

  it("o campeonato soma a partida que acabou e manda a tabela a todos, uma vez", () => {
    const { t, a } = jogoAcabado();
    for (const c of [t, a.canal]) {
      const msgs = c.ultimas("campeonato");
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ partidas: 1 });
      // 0 x 0: cada clube ganha 1 ponto
      expect(msgs[0]!.clubes.map((l) => l.pontos)).toEqual([1, 1]);
      expect(msgs[0]!.jogadores.map((l) => l.apelido).sort()).toEqual(["Ana", "Beto"]);
    }
    expect(sala.campeonato.partidas).toBe(1);
  });

  it("a revanche soma uma segunda partida; só o Dono zera", () => {
    const { a, b } = jogoAcabado();
    sala.tratarControle(a.j, { t: "revanche" });
    sala.tratarControle(a.j, { t: "config", duracao: 2 }); // (ignorado com a partida rolando; só garante que nada quebra)
    for (let i = 0; i < 130_000 / 16 && !sala.partida!.terminou; i++) {
      tempo += 16;
      sala.avancar();
    }
    expect(sala.campeonato.partidas).toBe(2);

    sala.tratarControle(b.j, { t: "zerar" });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.campeonato.partidas).toBe(2);

    sala.tratarControle(a.j, { t: "zerar" });
    expect(sala.campeonato.partidas).toBe(0);
    const ultima = b.canal.ultimas("campeonato").at(-1)!;
    expect(ultima).toMatchObject({ partidas: 0, clubes: [], jogadores: [] });
  });

  it("quem entra depois (telão ou controle) recebe a tabela se já houve partida", () => {
    jogoAcabado();
    expect(tela().ultimas("campeonato")).toHaveLength(1);
    const novo = new CanalFalso();
    sala.entrarControle(novo, "Caio");
    expect(novo.ultimas("campeonato")).toHaveLength(1);
  });

  it("sem nenhuma partida terminada, ninguém recebe tabela", () => {
    const t = tela();
    expect(t.ultimas("campeonato")).toHaveLength(0);
  });

  it("quem entra depois do fim recebe o resultado", () => {
    jogoAcabado();
    const tardio = tela();
    expect(tardio.ultimas("fim")).toHaveLength(1);
    expect(decodificarSnapshot(tardio.binarias[0]!)!.fase).toBe(FASE.fim);
  });

  it("Revanche (só do Dono, só depois do fim) zera o placar e começa outra partida", () => {
    const { t, a, b } = jogoAcabado();
    const antiga = sala.partida;
    sala.tratarControle(b.j, { t: "revanche" });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.partida).toBe(antiga);

    sala.tratarControle(a.j, { t: "revanche" });
    expect(sala.partida).not.toBe(antiga);
    expect(sala.partida!.terminou).toBe(false);
    expect(sala.partida!.placar).toEqual([0, 0]);
    expect(t.ultimas("partida")).toHaveLength(2);
    passarTempo(500);
    expect(decodificarSnapshot(t.binarias[t.binarias.length - 1]!)!.tick).toBeLessThan(100);
  });

  it("Revanche no meio da partida é ignorada", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    const p = sala.partida;
    sala.tratarControle(a.j, { t: "revanche" });
    expect(sala.partida).toBe(p);
  });

  it("o Dono volta todos ao lobby: emPartida cai e os slots somem", () => {
    const { t, a, b } = jogoAcabado();
    sala.tratarControle(b.j, { t: "lobby" });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarControle(a.j, { t: "lobby" });
    expect(sala.partida).toBeNull();
    expect(t.ultimoLobby().emPartida).toBe(false);
    expect(a.j.slot).toBeNull();
    // E dá para configurar e começar de novo
    sala.tratarControle(a.j, { t: "config", n: 3 });
    expect(sala.config.n).toBe(3);
    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida!.config.n).toBe(3);
  });

  it("Lobby no meio da partida também funciona", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    sala.tratarControle(a.j, { t: "lobby" });
    expect(sala.partida).toBeNull();
    passarTempo(100);
  });
});

describe("com bots", () => {
  let comBots: Sala;

  beforeEach(() => {
    let n = 0;
    comBots = new Sala("BOTS", agora, () => `bt${n++}`, { semente: () => 7 });
  });

  function entrarB(apelido: string, lado?: "casa" | "visitante" | "tanto"): { canal: CanalFalso; j: Jogador } {
    const canal = new CanalFalso();
    const r = comBots.entrarControle(canal, apelido);
    if (!r.ok) throw new Error(r.codigo);
    if (lado) comBots.tratarControle(r.valor, { t: "lado", lado });
    return { canal, j: r.valor };
  }

  function telaB(): CanalFalso {
    const canal = new CanalFalso();
    const r = comBots.entrarTela(canal);
    if (!r.ok) throw new Error(r.codigo);
    return canal;
  }

  function passarB(ms: number): void {
    for (let i = 0; i < ms; i += 8) {
      tempo += 8;
      comBots.avancar();
    }
  }

  it("mira do passe (H1): com PASSE apertado e a bola nos pés, todos recebem quem receberia o passe; ao soltar, a lista esvazia", () => {
    const t = telaB();
    const a = entrarB("Ana", "casa");
    entrarB("Beto", "visitante");
    comBots.tratarControle(a.j, { t: "comecar" });
    passarB(7000); // pré-jogo e saída
    comBots.posicionarParaTeste(a.j.id, 0, 0, 0.55, 0, 0);
    passarB(200);
    expect(comBots.partida!.dominante).toBe(a.j.slot);
    const meuSlot = a.j.slot!;
    const antes = t.ultimas("mira").length;

    // Aperta PASSE (segura): a mira aparece com um companheiro do time dela
    comBots.comandoControle(a.j, codificarComando({ ...comandoParado(), seguros: BOTAO.passe }));
    passarB(150);
    const durante = t.ultimas("mira").at(-1) as unknown as { miras: Array<{ de: number; para: number; numero: number; alto: boolean }> };
    expect(t.ultimas("mira").length).toBeGreaterThan(antes);
    expect(durante.miras).toHaveLength(1);
    expect(durante.miras[0]!.de).toBe(meuSlot);
    const alvo = comBots.partida!.jogador(durante.miras[0]!.para)!;
    expect(alvo.vaga.time).toBe(0);
    expect(alvo.vaga.slot).not.toBe(meuSlot);
    expect(durante.miras[0]!.numero).toBe(alvo.vaga.numero);
    // O celular dela e o do outro também recebem (é mensagem para todos)
    expect((a.canal.ultimas("mira").at(-1) as unknown as { miras: unknown[] }).miras).toHaveLength(1);

    // Solta (toque): o passe sai e a mira some
    comBots.comandoControle(a.j, codificarComando({ ...comandoParado(), seguros: 0, acao: ACAO.passeToque, acaoSeq: 1 }));
    passarB(100);
    expect((t.ultimas("mira").at(-1) as unknown as { miras: unknown[] }).miras).toEqual([]);
  });

  it("a partida vem com 12 jogadores: os 2 humanos e os bots completando, com goleiros", () => {
    const t = telaB();
    const a = entrarB("Ana", "casa");
    entrarB("Beto", "visitante");
    comBots.tratarControle(a.j, { t: "comecar" });
    const p = t.ultimas("partida")[0] as PartidaMsg;
    expect(p.elenco).toHaveLength(12);
    expect(p.elenco.filter((v) => v.humano).map((v) => v.nome)).toEqual(["Ana", "Beto"]);
    expect(p.elenco.filter((v) => v.goleiro).map((v) => v.slot)).toEqual([0, 6]);
    expect(p.elenco.filter((v) => !v.humano && !v.goleiro)).toHaveLength(8);
    passarB(500);
    const s = decodificarSnapshot(t.binarias[t.binarias.length - 1]!)!;
    expect(s.jogadores).toHaveLength(12);
    expect(s.jogadores.filter((j) => j.humano)).toHaveLength(2);
  });

  it("quem entra com a partida rolando assume o lugar de um bot do time com menos humanos, e todos recebem o elenco novo", () => {
    const t = telaB();
    const a = entrarB("Ana", "casa");
    entrarB("Beto", "visitante");
    comBots.tratarControle(a.j, { t: "comecar" });
    const antes = t.ultimas("partida")[0] as PartidaMsg;

    const c = entrarB("Caio");
    expect(c.j.slot).not.toBeNull();
    const depois = t.ultimas("partida");
    expect(depois).toHaveLength(2);
    const nova = depois[1] as PartidaMsg;
    expect(nova.id).toBe(antes.id); // mesma partida, só o elenco mudou
    expect(nova.elenco.filter((v) => v.humano).map((v) => v.nome).sort()).toEqual(["Ana", "Beto", "Caio"]);
    expect(nova.elenco).toHaveLength(12);
    expect(c.canal.ultimas("voce").at(-1)).toMatchObject({ slot: c.j.slot, situacao: "normal" });
    // O comando dele mexe no jogador dele
    passarB(7000);
    const z = comBots.partida!.jogador(c.j.slot!)!.corpo.z;
    comBots.comandoControle(c.j, cmd({ dirRad: Math.PI / 2, forca01: 1 }));
    passarB(600);
    expect(comBots.partida!.jogador(c.j.slot!)!.corpo.z).toBeLessThan(z - 1);
  });

  it("quem cai fica com um bot jogando por ele; ao voltar com o token, retoma o controle", () => {
    const a = entrarB("Ana", "casa");
    const b = entrarB("Beto", "visitante");
    comBots.tratarControle(a.j, { t: "comecar" });
    passarB(7000);
    const jogador = comBots.partida!.jogador(b.j.slot!)!;
    comBots.desconectarControle(b.j, b.canal);
    // G1: o jogador dele vira bot e ele sai da fila de trocas até voltar
    expect(jogador.vaga.humano).toBe(false);
    expect(comBots.partida!.slotDoHumano(b.j.id)).toBeNull();
    expect(comBots.partida!.controle.fila(1)).toEqual([]);
    let andou = 0;
    let ux = jogador.corpo.x;
    let uz = jogador.corpo.z;
    for (let i = 0; i < 6000; i += 16) {
      tempo += 16;
      comBots.avancar();
      andou += Math.hypot(jogador.corpo.x - ux, jogador.corpo.z - uz);
      ux = jogador.corpo.x;
      uz = jogador.corpo.z;
    }
    expect(andou).toBeGreaterThan(3);

    const novo = new CanalFalso();
    expect(comBots.entrarControle(novo, "Beto", b.j.token).ok).toBe(true);
    expect(novo.ultimas("partida")).toHaveLength(1);
    // Volta com um jogador do time dele (o companheiro livre mais perto da bola) e no fim da fila
    expect(b.j.slot).not.toBeNull();
    expect(comBots.partida!.jogador(b.j.slot!)!.vaga).toMatchObject({ time: 1, humano: true, idControle: b.j.id });
    expect(comBots.partida!.controle.fila(1)).toEqual([b.j.id]);
    expect(novo.ultimas("voce").at(-1)).toMatchObject({ slot: b.j.slot, situacao: "normal" });
  });

  it("vaga que venceu (30 s fora) vira bot de vez e o elenco é reenviado", () => {
    const t = telaB();
    const a = entrarB("Ana", "casa");
    const b = entrarB("Beto", "visitante");
    comBots.tratarControle(a.j, { t: "comecar" });
    const slot = b.j.slot!;
    comBots.desconectarControle(b.j, b.canal);
    tempo += 31_000;
    comBots.varrer();
    const ultimo = t.ultimas("partida").at(-1) as PartidaMsg;
    expect(ultimo.elenco.find((v) => v.slot === slot)).toMatchObject({ humano: false });
    expect(ultimo.elenco.filter((v) => v.humano).map((v) => v.nome)).toEqual(["Ana"]);
    expect(comBots.partida!.jogador(slot)!.vaga.humano).toBe(false);
  });

  it("Revanche começa uma partida nova com id novo e pega quem entrou no meio", () => {
    const t = telaB();
    const a = entrarB("Ana", "casa");
    entrarB("Beto", "visitante");
    comBots.tratarControle(a.j, { t: "config", duracao: 2 });
    comBots.tratarControle(a.j, { t: "comecar" });
    const primeiro = (t.ultimas("partida")[0] as PartidaMsg).id;
    for (let i = 0; i < 700_000 / 16 && !comBots.partida!.terminou; i++) {
      tempo += 16;
      comBots.avancar();
    }
    expect(comBots.partida!.terminou).toBe(true);
    comBots.tratarControle(a.j, { t: "revanche" });
    const ultimo = t.ultimas("partida").at(-1) as PartidaMsg;
    expect(ultimo.id).toBe(primeiro + 1);
  });

  it("o gol da partida com bots chega com tudo: placar, evento e fim", () => {
    const t = telaB();
    const a = entrarB("Ana", "casa");
    comBots.tratarControle(a.j, { t: "config", duracao: 2 });
    comBots.tratarControle(a.j, { t: "comecar" });
    for (let i = 0; i < 700_000 / 16 && !comBots.partida!.terminou; i++) {
      tempo += 16;
      comBots.avancar();
    }
    expect(t.ultimas("fim")).toHaveLength(1);
    const fim = t.ultimas("fim")[0] as Fim;
    expect(fim.placar[0] + fim.placar[1]).toBe((t.ultimas("evento") as Evento[]).filter((e) => e.tipo === "gol").length);
  });
});

describe("clube aleatório", () => {
  it("o aleatório vira clubes de verdade ao começar, diferentes, e a revanche mantém os mesmos", () => {
    const t = tela();
    const a = entrar("Ana", "casa");
    entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "config", casa: "aleatorio", visitante: "aleatorio", duracao: 2 });
    expect(sala.config).toMatchObject({ casa: "aleatorio", visitante: "aleatorio" });

    sala.tratarControle(a.j, { t: "comecar" });
    const p = t.ultimas("partida")[0] as PartidaMsg;
    expect(p.config.casa).not.toBe("aleatorio");
    expect(p.config.visitante).not.toBe("aleatorio");
    expect(p.config.casa).not.toBe(p.config.visitante);
    // O lobby continua dizendo "aleatório" (a escolha do Dono não muda)
    expect(sala.config.casa).toBe("aleatorio");

    for (let i = 0; i < 700_000 / 16 && !sala.partida!.terminou; i++) {
      tempo += 16;
      sala.avancar();
    }
    sala.tratarControle(a.j, { t: "revanche" });
    const r = t.ultimas("partida").at(-1) as PartidaMsg;
    expect(r.id).toBe(p.id + 1);
    expect([r.config.casa, r.config.visitante]).toEqual([p.config.casa, p.config.visitante]);
  });

  it("escolher o mesmo clube nos dois lados continua trocando de lugar, mas aleatório nos dois é permitido", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "config", casa: "aleatorio" });
    sala.tratarControle(a.j, { t: "config", visitante: "aleatorio" });
    expect(sala.config).toMatchObject({ casa: "aleatorio", visitante: "aleatorio" });
    expect(a.canal.ultimoErro()).toBeUndefined();
  });
});
