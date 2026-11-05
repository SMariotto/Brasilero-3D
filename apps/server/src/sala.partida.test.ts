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
  sala = new Sala("ABCD", agora, () => `tk${n++}`, { semente: () => 42 });
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
    expect(p.campo).toMatchObject({ comp: 60, larg: 38, golLarg: 6, golAlt: 2.2, areaComp: 8, areaLarg: 12, paredes: true });
    expect(p.cores).toEqual(["#C8102E", "#006437"]); // Flamengo x Palmeiras
    expect(p.elenco.map((v) => [v.slot, v.time, v.nome, v.humano, v.idControle])).toEqual([
      [1, 0, "Ana", true, 0],
      [7, 1, "Beto", true, 1],
    ]);
    expect(t.ultimoLobby().emPartida).toBe(true);

    const vozA = a.canal.ultimas("voce")[0] as Voce;
    expect(vozA).toMatchObject({ slot: 1, time: 0, numero: 7, cor: "#C8102E", comBola: false, energia: 100, situacao: "normal" });
    expect((b.canal.ultimas("voce")[0] as Voce).slot).toBe(7);
  });

  it("na F2 o modo é sempre Arena, mesmo que o Dono tenha escolhido Campo", () => {
    const t = tela();
    const a = entrar("Ana", "casa");
    entrar("Beto", "visitante");
    sala.tratarControle(a.j, { t: "config", modo: "campo" });
    expect(sala.config.modo).toBe("campo");
    sala.tratarControle(a.j, { t: "comecar" });
    expect((t.ultimas("partida")[0] as PartidaMsg).config.modo).toBe("arena");
    expect(sala.partida!.campo.paredes).toBe(true);
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

  it("se um time tem mais humanos que N, N sobe (até 5)", () => {
    const a = entrar("A", "casa");
    sala.tratarControle(a.j, { t: "config", n: 3 });
    for (const n of ["B", "C", "D"]) entrar(n, "casa");
    entrar("E", "visitante");
    sala.tratarControle(a.j, { t: "comecar" });
    expect(sala.partida!.config.n).toBe(4);
    expect(sala.partida!.campo.comp).toBe(52);
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
  it("manda quando muda, no máximo 10 por segundo", () => {
    const a = entrar("Ana", "casa");
    sala.tratarControle(a.j, { t: "comecar" });
    passarTempo(7000);
    const antes = a.canal.ultimas("voce").length;
    sala.comandoControle(a.j, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.correr })); // a energia muda a cada passo
    passarTempo(1000);
    const novas = a.canal.ultimas("voce").length - antes;
    expect(novas).toBeGreaterThanOrEqual(5);
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
