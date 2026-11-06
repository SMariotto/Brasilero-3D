import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, type Config } from "../protocolo/config";
import { ACAO, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { Partida, type VagaPartida } from "./partida";

const CASA = 1;
const CASA_2 = 2;
const VIS = 7;
const VIS_2 = 8;

const vaga = (slot: number, time: 0 | 1): VagaPartida => ({ slot, time, numero: slot, nome: `J${slot}`, humano: true, idControle: slot, goleiro: false });

/** Modo Campo, 2 humanos por time, sem bots: os reinícios e a defesa na forma pura. */
function criar(opcoes: Partial<Config> = {}): Partida {
  return new Partida({
    config: { ...CONFIG_PADRAO, modo: "campo", duracao: 4, ...opcoes },
    elenco: [vaga(CASA, 0), vaga(CASA_2, 0), vaga(VIS, 1), vaga(VIS_2, 1)],
    semente: 3,
    semBots: true,
  });
}

function rodar(p: Partida, s: number): void {
  for (let i = 0; i < Math.round(s * 60); i++) p.passo();
}

const cmd = (extra: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): Comando => {
  const { dirRad, forca01, ...resto } = extra;
  return { ...comandoParado(), ang: anguloParaByte(dirRad ?? 0), mag: magParaByte(forca01 ?? 0), ...resto };
};

/** Em jogo, jogadores espalhados longe da ação (para não atrapalhar), a bola solta. */
function emJogo(p: Partida): void {
  rodar(p, 6.2);
  expect(p.fase).toBe(FASE.jogo);
  p.eventosPendentes();
  const longe: [number, number, number][] = [[CASA, -20, 15], [CASA_2, -20, -15], [VIS, 20, 15], [VIS_2, 20, -15]];
  for (const [slot, x, z] of longe) {
    const j = p.jogador(slot)!;
    j.corpo.x = x;
    j.corpo.z = z;
    j.corpo.vx = j.corpo.vz = 0;
  }
}

let seq = 0;
/** Carrinho na direção do joystick (o gatilho novo, PASSE segurado, é testado à parte). */
function darCarrinho(p: Partida, slot: number, dirRad: number): void {
  p.definirComando(slot, cmd({ dirRad, forca01: 1 }));
  p.iniciarCarrinho(p.jogador(slot)!);
  p.passo();
}

function passeToque(p: Partida, slot: number, dirRad?: number): void {
  const joy = dirRad === undefined ? {} : { dirRad, forca01: 1 };
  p.definirComando(slot, cmd({ ...joy, seguros: BOTAO.passe }));
  rodar(p, 0.05);
  seq = (seq + 1) & 255;
  p.definirComando(slot, cmd({ ...joy, seguros: 0, acao: ACAO.passeToque, acaoSeq: seq }));
  p.passo();
  p.definirComando(slot, cmd());
}

function chutarForte(p: Partida, slot: number, dirRad: number): void {
  p.definirComando(slot, cmd({ dirRad, forca01: 1, seguros: BOTAO.chute }));
  rodar(p, 0.8);
  seq = (seq + 1) & 255;
  p.definirComando(slot, cmd({ dirRad, forca01: 1, seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: seq }));
  p.passo();
  p.definirComando(slot, cmd());
}

/** Põe o jogador com a bola dominada. */
function comABola(p: Partida, slot: number, x: number, z: number, dir = 0): void {
  p.posicionarParaTeste(slot, x, z, x + Math.cos(dir) * 0.55, z + Math.sin(dir) * 0.55, dir);
  rodar(p, 0.1);
  expect(p.dominante).toBe(slot);
}

describe("lateral", () => {
  /** A Casa chuta a bola para fora pela lateral de Z negativo. */
  function bolaForaPelaLateral(): Partida {
    const p = criar();
    emJogo(p);
    comABola(p, CASA, 0, -15);
    chutarForte(p, CASA, Math.PI / 2); // cima do celular = -Z
    rodar(p, 0.4); // a bola já saiu, e o cobrador ainda está deslizando
    return p;
  }

  it("a bola que sai inteira pela lateral vira reinício para o time que NÃO tocou por último", () => {
    const p = bolaForaPelaLateral();
    expect(p.fase).toBe(FASE.reinicio);
    expect(p.reinicio).toMatchObject({ tipo: "lateral", time: 1 });
    expect(p.bola.z).toBeCloseTo(-p.campo.metadeLarg, 5);
    const ev = p.eventosPendentes();
    expect(ev.find((e) => e.tipo === "lateral")).toMatchObject({ dados: { time: 1 } });
    expect(ev.some((e) => e.tipo === "apito")).toBe(true);
  });

  it("o relógio para durante o reinício", () => {
    const p = bolaForaPelaLateral();
    const r = p.relogio;
    rodar(p, 2);
    expect(p.relogio).toBe(r);
  });

  it("o cobrador desliza até a bola em até 1 s e fica com ela", () => {
    const p = bolaForaPelaLateral();
    const quem = p.reinicio!.cobrador!;
    expect([VIS, VIS_2]).toContain(quem);
    expect(p.reinicio!.pronto).toBe(false);
    rodar(p, 1.1);
    expect(p.reinicio!.pronto).toBe(true);
    expect(p.dominante).toBe(quem);
    expect(Math.hypot(p.jogador(quem)!.corpo.x - p.bola.x, p.jogador(quem)!.corpo.z - p.bola.z)).toBeCloseTo(0.55, 1);
    expect(p.estadoDe(quem)!.situacao).toBe("lateral");
  });

  it("adversários ficam a pelo menos 4 m da bola durante o reinício", () => {
    const p = bolaForaPelaLateral();
    const x = p.bola.x;
    const casa = p.jogador(CASA)!.corpo;
    // O adversário tenta correr para a bola
    casa.x = x;
    casa.z = p.bola.z + 6;
    p.definirComando(CASA, cmd({ dirRad: Math.PI / 2, forca01: 1 }));
    for (let i = 0; i < 90; i++) {
      p.passo();
      if (p.fase !== FASE.reinicio) break;
      expect(Math.hypot(casa.x - p.bola.x, casa.z - p.bola.z)).toBeGreaterThanOrEqual(3.99);
    }
  });

  it("a lateral é cobrada com PASSE, e a bola entra em jogo com o relógio correndo", () => {
    const p = bolaForaPelaLateral();
    rodar(p, 1.1);
    const quem = p.reinicio!.cobrador!;
    p.eventosPendentes();
    passeToque(p, quem, -Math.PI / 2); // para baixo do celular = +Z, para dentro do campo
    expect(p.fase).toBe(FASE.jogo);
    expect(p.reinicio).toBeNull();
    expect(p.bola.vz).toBeGreaterThan(5);
    expect(p.eventosPendentes().some((e) => e.tipo === "passe")).toBe(true);
    const r = p.relogio;
    rodar(p, 1);
    expect(p.relogio).toBeLessThan(r);
  });

  it("na lateral o CHUTE está desligado", () => {
    const p = bolaForaPelaLateral();
    rodar(p, 1.1);
    const quem = p.reinicio!.cobrador!;
    chutarForte(p, quem, -Math.PI / 2);
    expect(p.fase).toBe(FASE.reinicio);
    expect(p.dominante).toBe(quem);
  });

  it("sem ação, a cobrança sai sozinha 5 s depois de o cobrador chegar", () => {
    const p = bolaForaPelaLateral();
    rodar(p, 1.2);
    const pronto = p.reinicio!.prontoEm!;
    expect(p.reinicio!.pronto).toBe(true);
    while (p.t - pronto < 4.8) p.passo();
    expect(p.fase).toBe(FASE.reinicio);
    while (p.t - pronto < 5.3) p.passo();
    expect(p.fase).toBe(FASE.jogo);
    expect(p.eventosPendentes().filter((e) => e.tipo === "passe").length).toBeGreaterThan(0);
  });

  it("a bola que sai pela lateral do outro lado também vira lateral, para quem não tocou", () => {
    const p = criar();
    emJogo(p);
    comABola(p, VIS, 0, 15, 0);
    chutarForte(p, VIS, -Math.PI / 2); // +Z
    rodar(p, 1.5);
    expect(p.reinicio).toMatchObject({ tipo: "lateral", time: 0 });
    expect(p.bola.z).toBeCloseTo(p.campo.metadeLarg, 5);
  });
});

describe("linha de fundo: escanteio e tiro de meta", () => {
  it("o defensor tira para fora: escanteio do atacante, no canto, com a bola no chão", () => {
    const p = criar();
    emJogo(p);
    // O Visitante defende o gol de X positivo e chuta para fora, ao lado do gol
    comABola(p, VIS, 24, 10);
    chutarForte(p, VIS, 0);
    rodar(p, 1.5);
    expect(p.reinicio).toMatchObject({ tipo: "escanteio", time: 0 });
    expect(p.bola.x).toBeGreaterThan(p.campo.metadeComp - 0.5);
    expect(Math.abs(p.bola.z)).toBeGreaterThan(p.campo.metadeLarg - 0.5);
    expect(p.bola.z).toBeGreaterThan(0); // saiu do lado de Z positivo
    expect(p.eventosPendentes().find((e) => e.tipo === "escanteio")).toMatchObject({ dados: { time: 0 } });
  });

  it("no escanteio vale PASSE e CHUTE (cruzamento forte)", () => {
    const p = criar();
    emJogo(p);
    comABola(p, VIS, 24, 10);
    chutarForte(p, VIS, 0);
    rodar(p, 2.5);
    const quem = p.reinicio!.cobrador!;
    expect(p.estadoDe(quem)!.situacao).toBe("escanteio");
    chutarForte(p, quem, Math.PI); // esquerda da tela = -X, para dentro da área
    expect(p.fase).toBe(FASE.jogo);
    expect(Math.hypot(p.bola.vx, p.bola.vz)).toBeGreaterThan(20);
  });

  it("o atacante chuta para fora: tiro de meta do time que defende (o cobrador fica perto do gol)", () => {
    const p = criar();
    emJogo(p);
    comABola(p, CASA, 24, 12);
    chutarForte(p, CASA, 0); // para o gol de X positivo, mas largo
    rodar(p, 1.5);
    expect(p.reinicio).toMatchObject({ tipo: "tiroDeMeta", time: 1 });
    expect(p.bola.x).toBeCloseTo(p.campo.metadeComp - 3, 1);
    expect(Math.abs(p.bola.z)).toBeLessThan(0.1);
    expect(p.eventosPendentes().find((e) => e.tipo === "tiroDeMeta")).toMatchObject({ dados: { time: 1 } });
  });

  it("no tiro de meta o CHUTE também está desligado", () => {
    const p = criar();
    emJogo(p);
    comABola(p, CASA, 24, 12);
    chutarForte(p, CASA, 0);
    rodar(p, 2.5);
    const quem = p.reinicio!.cobrador!;
    chutarForte(p, quem, Math.PI);
    expect(p.fase).toBe(FASE.reinicio);
  });

  it("gol não vira escanteio nem tiro de meta", () => {
    const p = criar();
    emJogo(p);
    comABola(p, CASA, 20, 0);
    chutarForte(p, CASA, 0);
    rodar(p, 1.5);
    expect(p.fase).toBe(FASE.gol);
    expect(p.placar).toEqual([1, 0]);
  });

  it("no modo Arena não há lateral nem escanteio (a bola quica na parede)", () => {
    const p = criar({ modo: "arena" });
    emJogo(p);
    comABola(p, CASA, 0, -15);
    chutarForte(p, CASA, Math.PI / 2);
    rodar(p, 2);
    expect(p.fase).toBe(FASE.jogo);
    expect(p.reinicio).toBeNull();
  });
});

describe("carrinho e falta", () => {
  it("o carrinho desliza 1 s começando a 9 m/s, fica no chão 0,8 s e só repete depois de 1,5 s", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 10, 10);
    darCarrinho(p, CASA, 0);
    p.passo();
    const j = p.jogador(CASA)!;
    expect(j.carrinho).not.toBeNull();
    expect(Math.hypot(j.corpo.vx, j.corpo.vz)).toBeGreaterThan(8);
    rodar(p, 0.5);
    expect(Math.hypot(j.corpo.vx, j.corpo.vz)).toBeLessThan(5); // freando
    rodar(p, 0.6);
    expect(j.carrinho).toBeNull();
    expect(p.noChao(j)).toBe(true); // ainda no chão
    // Deslizou uns 4,5 m (9 m/s freando até parar em 1 s)
    expect(j.corpo.x).toBeGreaterThan(3.5);
    expect(j.corpo.x).toBeLessThan(5.5);
    rodar(p, 0.9);
    expect(p.noChao(j)).toBe(false);
    // Recarga: depois de 1,5 s do fim do deslize pode de novo
    expect(p.iniciarCarrinho(j)).toBe(false); // 1,5 s de recarga ainda não passaram
    rodar(p, 1.2);
    expect(p.iniciarCarrinho(j)).toBe(true);
    expect(j.carrinho).not.toBeNull();
  });

  it("encostar na bola primeiro: a bola sai a 8 m/s na direção do carrinho e não é falta", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 1.4, 0);
    p.jogador(VIS)!.corpo.x = 3.6; // fica no caminho do deslize, DEPOIS da bola
    p.jogador(VIS)!.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    // Logo depois do toque (H1: o adversário, que também é humano, passa a amortecer a bola quando ela chega perto dele)
    rodar(p, 0.06);
    expect(p.bola.vx).toBeGreaterThan(5);
    rodar(p, 0.14);
    rodar(p, 1.2);
    expect(p.fase).toBe(FASE.jogo);
    expect(p.eventosPendentes().some((e) => e.tipo === "falta")).toBe(false);
  });

  it("carrinho que acerta o adversário ANTES da bola é falta: ele cai 1,2 s e o time dele cobra tiro livre", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12); // bola longe
    const vit = p.jogador(VIS)!;
    vit.corpo.x = 2.5;
    vit.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    rodar(p, 0.5);
    const ev = p.eventosPendentes();
    expect(ev.find((e) => e.tipo === "falta")).toMatchObject({ dados: { de: CASA, em: VIS } });
    expect(ev.some((e) => e.tipo === "apito")).toBe(true);
    expect(p.fase).toBe(FASE.reinicio);
    expect(p.reinicio).toMatchObject({ tipo: "falta", time: 1 });
    expect(p.noChao(vit)).toBe(true);
    expect(p.snapshot().jogadores.find((j) => j.slot === VIS)!.caido).toBe(true);
    rodar(p, 1.3);
    expect(p.noChao(vit)).toBe(false);
  });

  it("no tiro livre os adversários ficam a pelo menos 5 m e o cobrador não é o que caiu", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12);
    p.jogador(VIS)!.corpo.x = 2.5;
    p.jogador(VIS)!.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    rodar(p, 0.5);
    expect(p.reinicio!.cobrador).toBe(VIS_2);
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1 }));
    for (let i = 0; i < 90 && p.fase === FASE.reinicio; i++) {
      p.passo();
      const c = p.jogador(CASA)!.corpo;
      if (p.fase === FASE.reinicio) expect(Math.hypot(c.x - p.bola.x, c.z - p.bola.z)).toBeGreaterThanOrEqual(4.99);
    }
  });

  it("o jogador caído não domina a bola, não age e não se mexe", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12);
    const vit = p.jogador(VIS)!;
    vit.corpo.x = 2.5;
    vit.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    rodar(p, 0.5);
    const x = vit.corpo.x;
    p.definirComando(VIS, cmd({ dirRad: Math.PI, forca01: 1 }));
    rodar(p, 0.3);
    expect(Math.abs(vit.corpo.x - x)).toBeLessThan(0.3);
    expect(p.estadoDe(VIS)!.situacao).toBe("caido");
  });

  it("falta dentro da própria área vira tiro livre na linha da área (sem pênalti)", () => {
    const p = criar();
    emJogo(p);
    // A Casa defende X negativo: o carrinho dela acerta o Visitante dentro da área dela
    p.posicionarParaTeste(CASA, -27, 0, -20, 12);
    const vit = p.jogador(VIS)!;
    vit.corpo.x = -25, vit.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    rodar(p, 0.5);
    expect(p.reinicio).toMatchObject({ tipo: "falta", time: 1 });
    expect(p.bola.x).toBeCloseTo(-p.campo.metadeComp + p.campo.areaProf, 5);
  });

  it("com as faltas desligadas, o carrinho no adversário não apita nada", () => {
    const p = criar({ faltas: false });
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12);
    const vit = p.jogador(VIS)!;
    vit.corpo.x = 2.5;
    vit.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    rodar(p, 0.6);
    expect(p.eventosPendentes().some((e) => e.tipo === "falta")).toBe(false);
    expect(p.fase).toBe(FASE.jogo);
    expect(p.noChao(vit)).toBe(false);
  });

  it("carrinho que tira a bola do dono é desarme (roubo por carrinho) e entra nas estatísticas", () => {
    const p = criar();
    emJogo(p);
    comABola(p, VIS, 3, 0, Math.PI); // o Visitante vem de frente para o carrinho, com a bola à frente dele
    const c = p.jogador(CASA)!;
    c.corpo.x = -0.2;
    c.corpo.z = 0;
    darCarrinho(p, CASA, 0);
    p.eventosPendentes();
    rodar(p, 0.5);
    const ev = p.eventosPendentes();
    expect(ev.find((e) => e.tipo === "roubo")).toMatchObject({ dados: { slot: CASA, de: VIS, jeito: "carrinho" } });
    expect(p.resumo().destaques.desarmes).toEqual({ slot: CASA, quantidade: 1, nome: `J${CASA}` });
  });
});

describe("carrinho pelo PASSE segurado (G1)", () => {
  it("toque rápido no PASSE só dá o bote; segurar 0,3 s sem a bola vira carrinho", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12); // bola longe, ninguém com ela
    const j = p.jogador(CASA)!;
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.passe }));
    rodar(p, 0.1);
    expect(j.bote).not.toBeNull();
    expect(j.carrinho).toBeNull();
    rodar(p, 0.15); // 0,25 s: o bote acabou, ainda não são 0,3 s
    expect(j.carrinho).toBeNull();
    rodar(p, 0.1); // 0,35 s segurando
    expect(j.carrinho).not.toBeNull();
    // Soltou e apertou rápido de novo: só bote (se a recarga deixar), nunca carrinho
  });

  it("soltar antes de 0,3 s não dá carrinho", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12);
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.2);
    p.definirComando(CASA, cmd({ seguros: 0 }));
    rodar(p, 0.5);
    expect(p.jogador(CASA)!.carrinho).toBeNull();
  });

  it("se o bote roubou a bola, continuar segurando não vira carrinho (vira lançamento)", () => {
    const p = criar();
    emJogo(p);
    comABola(p, VIS, 3, 0, Math.PI);
    const c = p.jogador(CASA)!;
    c.corpo.x = 1.3;
    c.corpo.z = 0;
    c.corpo.dir = 0;
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.2);
    expect(p.dominante).toBe(CASA); // o bote roubou
    p.jogador(VIS)!.caidoAte = 99; // o antigo dono não retoma a bola durante o teste
    rodar(p, 0.2); // passou dos 0,3 s segurando
    expect(p.dominante).toBe(CASA);
    expect(c.carrinho).toBeNull();
  });

  it("CHUTE sem a bola não dá mais carrinho", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12);
    p.definirComando(CASA, cmd({ seguros: BOTAO.chute }));
    rodar(p, 0.5);
    expect(p.jogador(CASA)!.carrinho).toBeNull();
  });
});

describe("bote", () => {
  it("bote em quem está com a bola, a menos de 0,8 m, rouba (e conta desarme)", () => {
    const p = criar();
    emJogo(p);
    comABola(p, VIS, 3, 0, Math.PI);
    const c = p.jogador(CASA)!;
    c.corpo.x = 1.3;
    c.corpo.z = 0;
    c.corpo.dir = 0;
    p.eventosPendentes();
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.2);
    expect(p.dominante).toBe(CASA);
    expect(p.eventosPendentes().find((e) => e.tipo === "roubo")).toMatchObject({ dados: { slot: CASA, de: VIS, jeito: "bote" } });
    expect(p.resumo().destaques.desarmes).toEqual({ slot: CASA, quantidade: 1, nome: `J${CASA}` });
  });

  it("o antigo dono não retoma a bola na hora", () => {
    const p = criar();
    emJogo(p);
    comABola(p, VIS, 3, 0, Math.PI);
    const c = p.jogador(CASA)!;
    c.corpo.x = 1.3;
    c.corpo.z = 0;
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.15);
    expect(p.dominante).toBe(CASA);
    rodar(p, 0.1);
    expect(p.dominante).toBe(CASA);
  });

  it("recarga de 0,8 s: o segundo bote seguido não acontece", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 12);
    const j = p.jogador(CASA)!;
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    p.passo();
    expect(j.bote).not.toBeNull();
    rodar(p, 0.26); // o bote dura 0,25 s (soltar antes de 0,3 s: não vira carrinho)
    expect(j.bote).toBeNull();
    p.definirComando(CASA, cmd({ seguros: 0 }));
    p.passo();
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    p.passo();
    expect(j.bote).toBeNull(); // ainda em recarga
    p.definirComando(CASA, cmd({ seguros: 0 }));
    rodar(p, 0.7);
    p.definirComando(CASA, cmd({ seguros: 0 }));
    p.passo();
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    p.passo();
    expect(j.bote).not.toBeNull();
  });

  it("o bote avança ~2,25 m (0,25 s a 9 m/s) na direção da bola", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 12, 0);
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.3);
    expect(p.jogador(CASA)!.corpo.x).toBeGreaterThan(1.9);
    expect(p.jogador(CASA)!.corpo.x).toBeLessThan(2.7);
  });
});

describe("voleio e lançamento", () => {
  it("bola no ar entre 0,6 e 1,6 m a menos de 1 m: CHUTE dispara na hora, sem carregar, com força 0,7", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 20, 0, 20.6, 0);
    p.bola.y = 1;
    p.bola.vy = 0;
    p.eventosPendentes();
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.chute }));
    p.passo();
    const ev = p.eventosPendentes().find((e) => e.tipo === "chute");
    expect(ev).toMatchObject({ dados: { slot: CASA, forca: 0.7 } });
    expect(Math.hypot(p.bola.vx, p.bola.vz)).toBeGreaterThan(24);
    expect(p.jogador(CASA)!.carrinho).toBeNull(); // o voleio passa na frente do carrinho
  });

  it("cabeceio: a mesma coisa com a bola entre 1,6 e 2,2 m", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 0.5, 0);
    p.bola.y = 2;
    p.bola.vy = 0;
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.chute }));
    p.passo();
    expect(p.eventosPendentes().some((e) => e.tipo === "chute")).toBe(true);
  });

  it("bola alta demais ou longe demais não é voleio (CHUTE sem a bola não dá mais carrinho)", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 0.6, 0);
    p.bola.y = 3;
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.chute }));
    p.passo();
    expect(p.eventosPendentes().some((e) => e.tipo === "chute")).toBe(false);
    expect(p.jogador(CASA)!.carrinho).toBeNull();
  });

  it("PASSE segurado é lançamento: vai por cima para o companheiro mais avançado do cone", () => {
    const p = criar();
    emJogo(p);
    comABola(p, CASA, 0, 0);
    const parceiro = p.jogador(CASA_2)!.corpo;
    parceiro.x = 16;
    parceiro.z = 1;
    p.eventosPendentes();
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1, seguros: BOTAO.passe }));
    rodar(p, 0.4);
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1, seguros: 0, acao: ACAO.passeSegurado, forca: 100, acaoSeq: 99 }));
    p.passo();
    const ev = p.eventosPendentes().find((e) => e.tipo === "passe");
    expect(ev).toMatchObject({ dados: { de: CASA, para: CASA_2, alto: true } });
    expect(p.bola.vy).toBeGreaterThanOrEqual(5);
  });

  it("PASSE com toque é rasteiro e mira no companheiro do cone", () => {
    const p = criar();
    emJogo(p);
    comABola(p, CASA, 0, 0);
    const parceiro = p.jogador(CASA_2)!.corpo;
    parceiro.x = 12;
    parceiro.z = 2;
    p.eventosPendentes();
    passeToque(p, CASA, 0);
    const ev = p.eventosPendentes().find((e) => e.tipo === "passe");
    expect(ev).toMatchObject({ dados: { de: CASA, para: CASA_2, alto: false } });
    expect(p.bola.vy).toBe(0);
    expect(p.bola.vz).toBeGreaterThan(0.5); // aponta para o lado onde o companheiro está
  });
});
