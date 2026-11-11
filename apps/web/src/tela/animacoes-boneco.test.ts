import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANIM, ANIMACAO, JOGADOR } from "@b3d/core";
import {
  ALTURA_DA_DEFESA_ALTA_M,
  ATRASO_DO_CONTATO_S,
  CLIPES_COM_LOOP,
  CONTATO_DO_CHUTE_S,
  ControladorDeRosto,
  ESCALA_MAX_DA_CORRIDA,
  ESCALA_MIN_DA_CORRIDA,
  TODOS_OS_CLIPES,
  VELOCIDADE_DA_CORRIDA_GRAVADA,
  decidir,
  expressaoDoEstado,
  pePorLado,
  velocidadeDaCorrida,
  type ContextoDaAnimacao,
} from "./animacoes-boneco";
import { EXPRESSAO } from "./boneco-dados";

const TABELA = JSON.parse(readFileSync(new URL("../../public/boneco/animacoes.json", import.meta.url), "utf8")) as Record<string, { quadros: number; fps: number; loop: boolean }>;
// Duração de cada clipe como no .glb: quadros / fps (o último quadro dos loops repete o primeiro)
const DURACOES = new Map(Object.entries(TABELA).map(([nome, i]) => [nome, i.quadros / i.fps]));

const LINHA: ContextoDaAnimacao = { goleiro: false, x: 0, z: 0, dir: 0, vel: 0 };
const GOLEIRO: ContextoDaAnimacao = { ...LINHA, goleiro: true };
const nome = (anim: number, ctx = LINHA): string | undefined => decidir(anim, ctx, DURACOES)?.clipe;

describe("animacoes.json", () => {
  it("tem exatamente os 9 clipes do boneco, a 30 fps, e os loops são parado, correr e gk_parado", () => {
    expect(Object.keys(TABELA).sort()).toEqual([...TODOS_OS_CLIPES].sort());
    for (const i of Object.values(TABELA)) expect(i.fps).toBe(30);
    expect(new Set(Object.entries(TABELA).filter(([, i]) => i.loop).map(([n]) => n))).toEqual(CLIPES_COM_LOOP);
  });
});

describe("decidir: um clipe para cada estado do jogo", () => {
  it("jogador de linha: parado, corrida, chute, comemoração", () => {
    expect(nome(ANIM.parado)).toBe("parado");
    expect(nome(ANIM.corrida, { ...LINHA, vel: 5 })).toBe("correr");
    expect(nome(ANIM.chute)).toBe("chutar");
    expect(nome(ANIM.comemoracao)).toBe("comemorar");
  });

  it("goleiro: parado e com a bola ficam agachados em gk_parado", () => {
    expect(nome(ANIM.goleiroParado, GOLEIRO)).toBe("gk_parado");
    expect(nome(ANIM.goleiroComBola, GOLEIRO)).toBe("gk_parado");
    expect(nome(ANIM.parado, GOLEIRO)).toBe("gk_parado");
  });

  it("os estados sem animação própria usam a reserva e dizem isso (propria = false)", () => {
    const semClipe = [ANIM.carrinho, ANIM.queda, ANIM.cabeceio, ANIM.cobranca, ANIM.recepcao];
    for (const anim of semClipe) {
      const d = decidir(anim, LINHA, DURACOES)!;
      expect(d, `anim ${anim}`).toMatchObject({ clipe: "parado", propria: false });
      expect(decidir(anim, GOLEIRO, DURACOES)).toMatchObject({ clipe: "gk_parado", propria: false });
    }
    expect(decidir(ANIM.goleiroComBola, GOLEIRO, DURACOES)).toMatchObject({ clipe: "gk_parado", propria: false });
    // O passe usa o gesto do chute, mas não é um clipe de passe
    expect(decidir(ANIM.passe, LINHA, DURACOES)).toMatchObject({ clipe: "chutar", propria: false });
  });

  it("todo estado do protocolo recebe algum clipe que existe", () => {
    for (const anim of Object.values(ANIM)) {
      for (const ctx of [LINHA, GOLEIRO]) {
        const d = decidir(anim, ctx, DURACOES);
        expect(d, `anim ${anim}`).not.toBeNull();
        expect(DURACOES.has(d!.clipe), d!.clipe).toBe(true);
      }
    }
  });

  it("sem o clipe de repouso não há o que tocar", () => {
    expect(decidir(ANIM.parado, LINHA, new Map([["correr", 0.5]]))).toBeNull();
  });

  it("sem um clipe, cai no repouso em vez de quebrar", () => {
    const so = new Map([["parado", 1.6]]);
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 5 }, so)?.clipe).toBe("parado");
    expect(decidir(ANIM.chute, LINHA, so)?.clipe).toBe("parado");
    expect(decidir(ANIM.comemoracao, LINHA, so)?.clipe).toBe("parado");
  });

  it("só parado, correr e gk_parado repetem; o resto toca uma vez", () => {
    expect(decidir(ANIM.parado, LINHA, DURACOES)?.repete).toBe(true);
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 5 }, DURACOES)?.repete).toBe(true);
    expect(decidir(ANIM.goleiroParado, GOLEIRO, DURACOES)?.repete).toBe(true);
    for (const anim of [ANIM.chute, ANIM.comemoracao, ANIM.goleiroMergulhoEsq]) expect(decidir(anim, GOLEIRO, DURACOES)?.repete, `anim ${anim}`).toBe(false);
  });
});

describe("corrida", () => {
  it("a velocidade do clipe acompanha a do jogador, com piso e teto", () => {
    expect(velocidadeDaCorrida(VELOCIDADE_DA_CORRIDA_GRAVADA)).toBeCloseTo(1, 10);
    expect(velocidadeDaCorrida(ESCALA_MIN_DA_CORRIDA * VELOCIDADE_DA_CORRIDA_GRAVADA)).toBeCloseTo(ESCALA_MIN_DA_CORRIDA, 10);
    expect(velocidadeDaCorrida(0.1)).toBe(ESCALA_MIN_DA_CORRIDA);
    expect(velocidadeDaCorrida(ESCALA_MAX_DA_CORRIDA * VELOCIDADE_DA_CORRIDA_GRAVADA * 1.5)).toBe(ESCALA_MAX_DA_CORRIDA);
    expect(velocidadeDaCorrida(3.5)).toBeGreaterThan(velocidadeDaCorrida(2));
  });

  it("na velocidade máxima do jogo, com e sem a bola, o clipe acompanha o chão sem bater no teto (o pé não desliza)", () => {
    for (const v of [JOGADOR.velocidadeMax, JOGADOR.velocidadeMax * JOGADOR.fatorVelocidadeComBola]) {
      expect(velocidadeDaCorrida(v)).toBeLessThan(ESCALA_MAX_DA_CORRIDA);
      expect(velocidadeDaCorrida(v)).toBeCloseTo(v / VELOCIDADE_DA_CORRIDA_GRAVADA, 10);
    }
  });

  it("o estado de corrida já sai com a velocidade certa", () => {
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 3.5 }, DURACOES)?.velocidade).toBeCloseTo(3.5 / VELOCIDADE_DA_CORRIDA_GRAVADA, 10);
  });
});

describe("chute e passe: o pé", () => {
  it("a bola à esquerda do corpo pede chutar_esq; à direita ou de frente, chutar", () => {
    // De frente para +X (dir = 0) a esquerda é -Z
    expect(pePorLado({ x: 0, z: 0, dir: 0, bola: { x: 0.5, y: 0, z: -0.4 } })).toBe("esq");
    expect(pePorLado({ x: 0, z: 0, dir: 0, bola: { x: 0.5, y: 0, z: 0.4 } })).toBe("dir");
    expect(pePorLado({ x: 0, z: 0, dir: 0, bola: { x: 0.6, y: 0, z: 0 } })).toBe("dir");
    expect(pePorLado({ x: 0, z: 0, dir: 0 })).toBe("dir");
  });

  it("vale para qualquer direção do corpo (virado para +Z, a esquerda é +X)", () => {
    const dir = Math.PI / 2;
    expect(pePorLado({ x: 3, z: 3, dir, bola: { x: 3.4, y: 0, z: 3.5 } })).toBe("esq");
    expect(pePorLado({ x: 3, z: 3, dir, bola: { x: 2.6, y: 0, z: 3.5 } })).toBe("dir");
    // Virado para -X a esquerda é +Z
    expect(pePorLado({ x: 0, z: 0, dir: Math.PI, bola: { x: -0.5, y: 0, z: 0.4 } })).toBe("esq");
  });

  it("o estado de chute escolhe o clipe pelo pé e acerta a bola logo depois do começo do estado", () => {
    const esq = decidir(ANIM.chute, { ...LINHA, bola: { x: 0.5, y: 0, z: -0.4 } }, DURACOES)!;
    expect(esq.clipe).toBe("chutar_esq");
    const dir = decidir(ANIM.chute, { ...LINHA, bola: { x: 0.5, y: 0, z: 0.4 } }, DURACOES)!;
    expect(dir.clipe).toBe("chutar");
    // O estado dura ANIMACAO.chuteS: o clipe inteiro cabe nele e o pé bate ~0,1 s depois do começo
    expect(DURACOES.get("chutar")! - dir.inicioS).toBeLessThanOrEqual(ANIMACAO.chuteS * dir.velocidade + 1e-9);
    expect((CONTATO_DO_CHUTE_S - dir.inicioS) / dir.velocidade).toBeCloseTo(ATRASO_DO_CONTATO_S, 5);
  });
});

describe("goleiro: mergulho", () => {
  const bolaBaixa = { x: 0, y: 0.3, z: 0 };

  it("de frente para +X, 'esquerda' do servidor (-Z) é a esquerda dele: gk_mergulho_esq", () => {
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, dir: 0, bola: bolaBaixa })).toBe("gk_mergulho_esq");
    expect(nome(ANIM.goleiroMergulhoDir, { ...GOLEIRO, dir: 0, bola: bolaBaixa })).toBe("gk_mergulho_dir");
  });

  it("de frente para -X o lado se inverte (o -Z do servidor passa a ser a direita dele)", () => {
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, dir: Math.PI, bola: bolaBaixa })).toBe("gk_mergulho_dir");
    expect(nome(ANIM.goleiroMergulhoDir, { ...GOLEIRO, dir: Math.PI, bola: bolaBaixa })).toBe("gk_mergulho_esq");
  });

  it("bola alta no começo do mergulho: defesa alta", () => {
    const alta = { x: 0, y: ALTURA_DA_DEFESA_ALTA_M + 0.2, z: 0 };
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, bola: alta })).toBe("gk_defesa_alta");
    expect(nome(ANIM.goleiroMergulhoDir, { ...GOLEIRO, bola: alta })).toBe("gk_defesa_alta");
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, bola: { x: 0, y: ALTURA_DA_DEFESA_ALTA_M - 0.3, z: 0 } })).not.toBe("gk_defesa_alta");
  });
});

describe("rosto", () => {
  it("cada estado pede a expressão certa", () => {
    expect(expressaoDoEstado(ANIM.comemoracao)).toEqual({ expressao: EXPRESSAO.felicidade, segura: true });
    expect(expressaoDoEstado(ANIM.queda)).toEqual({ expressao: EXPRESSAO.dor, segura: true });
    expect(expressaoDoEstado(ANIM.carrinho)).toEqual({ expressao: EXPRESSAO.dor, segura: true });
    expect(expressaoDoEstado(ANIM.chute)?.expressao).toBe(EXPRESSAO.forca);
    expect(expressaoDoEstado(ANIM.parado)).toBeNull();
    expect(expressaoDoEstado(ANIM.corrida)).toBeNull();
  });

  it("neutro (linha 0, quadro 0) quando nada acontece e pisca de tempos em tempos", () => {
    const c = new ControladorDeRosto(() => 0.5);
    expect(c.atualizar(0.016, ANIM.parado)).toEqual({ anim: EXPRESSAO.piscarUmOlho, quadro: 0 });
    let piscou = false;
    for (let t = 0; t < 8; t += 0.016) {
      const q = c.atualizar(0.016, ANIM.parado);
      if (q.anim === EXPRESSAO.piscarOsDois) piscou = true;
    }
    expect(piscou).toBe(true);
  });

  it("a felicidade da comemoração toca a 10 fps e fica no último quadro enquanto durar; sai quando o estado acaba", () => {
    const c = new ControladorDeRosto(() => 0.99);
    expect(c.atualizar(0.01, ANIM.comemoracao)).toEqual({ anim: EXPRESSAO.felicidade, quadro: 0 });
    expect(c.atualizar(0.2, ANIM.comemoracao)).toEqual({ anim: EXPRESSAO.felicidade, quadro: 2 });
    expect(c.atualizar(2, ANIM.comemoracao)).toEqual({ anim: EXPRESSAO.felicidade, quadro: 4 });
    expect(c.atualizar(0.016, ANIM.parado)).toEqual({ anim: EXPRESSAO.piscarUmOlho, quadro: 0 });
  });

  it("a força do chute toca uma vez (0,5 s) e volta ao neutro", () => {
    const c = new ControladorDeRosto(() => 0.99);
    expect(c.atualizar(0.01, ANIM.chute).anim).toBe(EXPRESSAO.forca);
    expect(c.atualizar(0.7, ANIM.chute)).toEqual({ anim: EXPRESSAO.piscarUmOlho, quadro: 0 });
  });
});
