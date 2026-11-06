import { BOLA, CHUTE, GOLEIRO, TIPO_CHUTE } from "../constantes";
import { grausParaRad, limitar } from "../util/vetor";
import { calcularChute, type EntradaChute, type VelocidadeBola } from "./acoes";

// Tipos de chute (H2). O jogador continua com um botão só (CHUTE com a bola); o servidor escolhe o tipo pelo lance:
//  - canudo: reto e forte, perto do gol com o ângulo aberto;
//  - chapada: chute com efeito, a bola sai por fora e curva para dentro do gol (ângulo fechado ou fora de ângulo);
//  - trivela: meio forte e meio com efeito, com a parte de fora do pé: curva para o lado contrário da chapada;
//  - cavadinha: chute leve que encobre o goleiro adiantado, com o jogador livre e perto do gol.
// Sem lance de gol (a direção não aponta para o gol, ou está longe demais) o chute é o de sempre ("normal").
// Aqui só há conta pura; a bola curva pelo `giro` da física (BOLA.giro*).

export type TipoDeChute = "normal" | "canudo" | "chapada" | "trivela" | "cavadinha";

/** O que o jogo sabe do lance além da posição do jogador. */
export interface SituacaoDeChute {
  /** O goleiro adversário, ou `null` se não há. */
  goleiro: { x: number; z: number } | null;
  /** Distância (m) do adversário de linha mais perto do jogador; `Infinity` se não há. */
  adversarioMaisPertoM: number;
}

export interface AnaliseDoChute {
  /** O chute aponta para o gol (dentro da margem da mira assistida)? */
  mirandoNoGol: boolean;
  /** Distância (m) do jogador ao centro do gol que ele ataca. */
  distancia: number;
  /** Distância (m) do jogador à linha de fundo, medida na direção do ataque. */
  ateALinha: number;
  /** Abertura do gol vista do jogador (graus, entre as duas traves). */
  abertura: number;
  /** Onde o chute cruzaria a linha do gol (Z), se seguisse reto. */
  zNaLinha: number;
  /** O goleiro está a quantos metros da linha de fundo (ou `null` sem goleiro). */
  goleiroAdiantadoM: number | null;
  /** Adversário de linha a menos de `TIPO_CHUTE.pressaoM`. */
  pressionado: boolean;
}

type Geometria = Pick<EntradaChute, "px" | "pz" | "time" | "campo" | "dirX" | "dirZ">;

/** Analisa o lance: distância, ângulo de abertura, para onde aponta, onde o goleiro está e se há pressão. */
export function analisarChute(e: Geometria, s: SituacaoDeChute): AnaliseDoChute {
  const ataque = e.time === 0 ? 1 : -1; // a Casa ataca o gol de X positivo
  const { metadeComp, golLarg } = e.campo;
  const dx = metadeComp - e.px * ataque; // à frente, em direção ao gol
  const meia = golLarg / 2;
  const pressionado = s.adversarioMaisPertoM < TIPO_CHUTE.pressaoM;
  const goleiroAdiantadoM = s.goleiro ? Math.max(0, metadeComp - s.goleiro.x * ataque) : null;

  if (dx < 0.5) {
    // Colado na linha de fundo, ou atrás dela: não há chute de gol
    return { mirandoNoGol: false, distancia: Math.hypot(dx, e.pz), ateALinha: dx, abertura: 0, zNaLinha: e.pz, goleiroAdiantadoM, pressionado };
  }
  const a1 = Math.atan2(-meia - e.pz, dx);
  const a2 = Math.atan2(meia - e.pz, dx);
  const abertura = ((Math.max(a1, a2) - Math.min(a1, a2)) * 180) / Math.PI;

  const dirFrente = e.dirX * ataque;
  const angulo = Math.atan2(e.dirZ, dirFrente);
  const margem = grausParaRad(CHUTE.miraMargemGraus);
  const mirandoNoGol = dirFrente > 0.05 && angulo >= Math.min(a1, a2) - margem && angulo <= Math.max(a1, a2) + margem;
  const zNaLinha = dirFrente > 0.05 ? e.pz + Math.tan(angulo) * dx : e.pz;
  return { mirandoNoGol, distancia: Math.hypot(dx, e.pz), ateALinha: dx, abertura, zNaLinha, goleiroAdiantadoM, pressionado };
}

/** A altura da bola (vertical, com gravidade e arrasto) em função da distância andada, para um chute a `vh` horizontal e `vy` vertical. */
function perfilDaBola(vh: number, vy: number, ate: number): { altura: (x: number) => number; tempo: (x: number) => number } {
  const dt = 1 / 120;
  const xs: number[] = [0];
  const ys: number[] = [BOLA.raio];
  let x = 0;
  let y = BOLA.raio;
  let h = vh;
  let v = vy;
  for (let i = 0; i < 6 * 120 && x < ate + 0.5 && y > 0; i++) {
    v -= BOLA.gravidade * dt;
    const f = Math.max(0, 1 - BOLA.arrasto * Math.hypot(h, v) * dt);
    h *= f;
    v *= f;
    x += h * dt;
    y += v * dt;
    xs.push(x);
    ys.push(y);
  }
  const achar = (px: number): { i: number; k: number } | null => {
    for (let i = 1; i < xs.length; i++) {
      if (xs[i]! >= px) return { i, k: (px - xs[i - 1]!) / Math.max(1e-9, xs[i]! - xs[i - 1]!) };
    }
    return null;
  };
  return {
    altura: (px) => {
      if (px <= 0) return BOLA.raio;
      const a = achar(px);
      return a ? ys[a.i - 1]! + (ys[a.i]! - ys[a.i - 1]!) * a.k : -1; // -1: a bola caiu antes de chegar
    },
    tempo: (px) => {
      const a = achar(px);
      return a ? (a.i - 1 + a.k) * dt : Infinity;
    },
  };
}

/**
 * A trajetória da cavadinha (`vh` horizontal e `vy` vertical, em m/s) para um chute de `distancia` m, com o goleiro `adiantadoM`
 * metros antes da linha de fundo, ou `null` se não existe: a bola tem que cruzar a linha do gol descendo, a `alturaNoGolM` (abaixo do
 * travessão) e estar acima do alcance do goleiro em toda a zona que ele poderia tocar, inclusive se ele recuar `goleiroRecuaM`.
 * Simula a bola com gravidade e arrasto.
 */
export function resolverCavadinha(distancia: number, adiantadoM: number): { vh: number; vy: number } | null {
  const c = TIPO_CHUTE.cavadinha;
  const zonaInicio = distancia - adiantadoM - GOLEIRO.alcanceEmPe;
  for (let vy = c.vyMin; vy <= c.vyMax + 1e-9; vy += 0.25) {
    // Acha o vh que faz a bola chegar à linha do gol à altura pedida (bisseção: mais vh = chega mais alta)
    let lo: number = c.vhMin;
    let hi: number = c.vhMax;
    const alturaEm = (vh: number): number => perfilDaBola(vh, vy, distancia).altura(distancia);
    if (alturaEm(hi) < c.alturaNoGolM || alturaEm(lo) > c.alturaNoGolM) continue;
    for (let i = 0; i < 24; i++) {
      const meio = (lo + hi) / 2;
      if (alturaEm(meio) > c.alturaNoGolM) hi = meio;
      else lo = meio;
    }
    const vh = (lo + hi) / 2;
    const perfil = perfilDaBola(vh, vy, distancia);
    // A zona onde o goleiro alcança a bola, em distância do chute: da frente dele (parado) até a frente dele depois de recuar
    // durante o voo (ele recua `goleiroRecuoMS` e nunca passa de `goleiroRecuoMinimoM` da linha)
    const recuo = Math.min(Math.max(0, adiantadoM - c.goleiroRecuoMinimoM), c.goleiroRecuoMS * perfil.tempo(distancia));
    const zonaFim = distancia - (adiantadoM - recuo) + GOLEIRO.alcanceEmPe;
    let livre = true;
    for (let x = Math.max(0.5, zonaInicio); x <= Math.min(distancia, zonaFim) && livre; x += 0.1) {
      if (perfil.altura(x) < c.alturaSobreGoleiroM) livre = false;
    }
    if (livre) return { vh, vy };
  }
  return null;
}

/**
 * O rumo inicial (rad, no referencial do ataque: +X para o gol, ângulo crescendo para +Z) para uma bola lançada a `v` m/s com o
 * efeito `giro` cruzar a linha do gol (a `dx` m) exatamente em `zt`. Simula a trajetória horizontal com as mesmas contas da física da
 * bola (arrasto e giro com decaimento) e acha o rumo por bisseção. Sem isto a bola passaria longe do canto nos ângulos muito fechados,
 * onde ela cruza a linha antes de a curva fazer efeito.
 */
export function rumoParaCruzar(pz: number, dx: number, zt: number, v: number, giro: number): number {
  const dt = 1 / 60;
  const cruza = (a0: number): number | null => {
    let a = a0;
    let g = giro;
    let s = v;
    let x = 0;
    let z = pz;
    for (let i = 0; i < 6 * 60; i++) {
      s *= Math.max(0, 1 - BOLA.arrasto * s * dt);
      a += g * dt;
      g *= Math.exp(-dt / BOLA.giroDecaimentoArS);
      x += s * Math.cos(a) * dt;
      z += s * Math.sin(a) * dt;
      if (x >= dx) return z;
    }
    return null;
  };
  const limite = grausParaRad(85);
  let lo = -limite;
  let hi = limite;
  for (let i = 0; i < 32; i++) {
    const meio = (lo + hi) / 2;
    const z = cruza(meio);
    // Rumo mais para +Z cruza com Z maior; se nem cruza a linha, está virado demais para o lado
    const acima = z === null ? meio > 0 : z > zt;
    if (acima) hi = meio;
    else lo = meio;
  }
  return (lo + hi) / 2;
}

/** Escolhe o tipo de chute pelo lance (a "regra" que o servidor aplica; todos os limites ficam em `TIPO_CHUTE`). */
export function escolherTipoDeChute(a: AnaliseDoChute): TipoDeChute {
  const t = TIPO_CHUTE;
  if (!a.mirandoNoGol || a.distancia > t.alcanceMaxM) return "normal";

  // Cavadinha: goleiro adiantado, jogador livre, perto do gol e com o gol razoavelmente de frente
  const c = t.cavadinha;
  if (
    !a.pressionado &&
    a.goleiroAdiantadoM !== null &&
    a.goleiroAdiantadoM >= c.goleiroAdiantadoM &&
    a.distancia >= c.distanciaMinM &&
    a.distancia <= c.distanciaMaxM &&
    a.abertura >= c.anguloMinGraus &&
    resolverCavadinha(a.ateALinha, a.goleiroAdiantadoM) !== null
  ) {
    return "cavadinha";
  }

  // Ângulo fechado: perto do gol a chapada curva a bola para dentro; longe a curva não compensa (o reto rende mais), então é trivela
  if (a.abertura < t.anguloFechadoGraus) {
    if (a.distancia > t.chapadaDistanciaMaxM) return "normal";
    // H4: o goleiro que sai da linha fecha o ângulo; contra ele o chute reto rende mais que a chapada e o canudo (medido com `npm run chutes`)
    return a.goleiroAdiantadoM !== null && a.goleiroAdiantadoM > t.chapadaGoleiroAteM ? "normal" : "chapada";
  }
  // Ângulo aberto: canudo se estiver perto e sem marcação em cima; marcado e de média distância, a trivela contorna o marcador
  if (a.abertura >= t.anguloAbertoGraus && a.distancia <= t.canudoDistanciaMaxM) {
    if (a.pressionado && a.distancia > t.pressaoTrivelaDistanciaM) return "trivela";
    return "canudo";
  }
  // Ângulo médio: a mistura de força e efeito (de longe, com o gol aberto, o chute reto de sempre rende o mesmo ou mais)
  return a.distancia <= t.chapadaDistanciaMaxM + 4 ? "trivela" : "normal";
}

export interface EntradaChuteComTipo extends EntradaChute {
  situacao: SituacaoDeChute;
  /** Força o tipo (simulador e testes). Sem isto o jogo escolhe pelo lance. */
  tipo?: TipoDeChute;
}

export interface ResultadoDoChute extends VelocidadeBola {
  forca: number;
  /** Efeito da bola (rad/s, ver `BOLA.giro`); 0 nos chutes retos. */
  giro: number;
  tipo: TipoDeChute;
}

/** O chute com o tipo escolhido: velocidade da bola, efeito e o tipo (para o telão mostrar). */
export function calcularChuteComTipo(e: EntradaChuteComTipo): ResultadoDoChute {
  const a = analisarChute(e, e.situacao);
  // Toque rápido: continua sendo o chute fraco de sempre (o tipo automático é para chute de verdade)
  const tipo = e.tipo ?? (e.forca < TIPO_CHUTE.forcaMinParaTipo ? "normal" : escolherTipoDeChute(a));
  const t = TIPO_CHUTE;
  const ataque = e.time === 0 ? 1 : -1;
  const meia = e.campo.golLarg / 2;
  const dx = a.ateALinha;

  if (tipo === "normal" || dx < 0.5) {
    const r = calcularChute(e);
    return { ...r, giro: 0, tipo: "normal" };
  }

  if (tipo === "canudo") {
    const r = calcularChute({ ...e, forca: Math.max(e.forca, t.canudoForcaMin) });
    return { ...r, giro: 0, tipo };
  }

  const erro = grausParaRad(e.rng.entre(-CHUTE.erroGraus, CHUTE.erroGraus) * t.erroEfeitoFator);

  if (tipo === "cavadinha") {
    const zt = limitar(a.zNaLinha, -(meia - 0.8), meia - 0.8);
    const d = Math.hypot(dx, zt - e.pz);
    const sol = resolverCavadinha(d, a.goleiroAdiantadoM ?? 3);
    if (!sol) {
      const r = calcularChute(e); // forçado sem solução: chute normal
      return { ...r, giro: 0, tipo: "normal" };
    }
    const ang = Math.atan2(zt - e.pz, dx) + erro;
    return {
      vx: ataque * Math.cos(ang) * sol.vh,
      vy: sol.vy,
      vz: Math.sin(ang) * sol.vh,
      forca: limitar((sol.vh - CHUTE.velocidadeBase) / CHUTE.velocidadeExtra, CHUTE.forcaToque, 1),
      giro: 0,
      tipo,
    };
  }

  // Chapada e trivela: miram um canto do gol, saem desviadas para um lado e a bola curva de volta
  const forcaMin = tipo === "chapada" ? t.chapadaForcaMin : t.trivelaForcaMin;
  const forca = limitar(Math.max(e.forca, forcaMin), CHUTE.forcaToque, 1);
  // O canto: o lado para onde o chute apontava; se mirava no meio, o canto longe do goleiro (ou do jogador)
  // (goleiro no meio do gol: o canto longe do jogador)
  const zGoleiro = e.situacao.goleiro && Math.abs(e.situacao.goleiro.z) > 0.3 ? e.situacao.goleiro.z : e.pz;
  const lado = Math.abs(a.zNaLinha) > 0.8 ? Math.sign(a.zNaLinha) : -Math.sign(zGoleiro || 1);
  const zt = lado * (meia - t.alvoMargemTraveM);
  const ladoDoCentro = -lado; // do canto para o centro do gol, em Z
  const ladoDaCurva = tipo === "chapada" ? ladoDoCentro : -ladoDoCentro; // a trivela curva para o outro lado
  const curva = grausParaRad(tipo === "chapada" ? t.chapadaCurvaGraus : t.trivelaCurvaGraus);
  const v = CHUTE.velocidadeBase + CHUTE.velocidadeExtra * forca;
  const T = Math.hypot(dx, zt - e.pz) / (v * t.fatorTempoDeVoo);
  const tau = BOLA.giroDecaimentoArS;
  const E = Math.exp(-T / tau);
  // O giro ω faz o rumo girar ω·τ·(1 − e^(−T/τ)) em T segundos: escolhe ω para a curva valer `curva`.
  const giroNoReferencialDoAtaque = (ladoDaCurva * curva) / (tau * (1 - E));
  // Para a bola CHEGAR ao canto (e não só mudar de rumo no fim), o rumo inicial é achado simulando a trajetória (sai desviada para
  // o lado contrário ao da curva, cerca de metade da curva nos ângulos abertos, e mais nos fechados).
  const ang0 = rumoParaCruzar(e.pz, dx, zt, v, giroNoReferencialDoAtaque) + erro;
  return {
    vx: ataque * Math.cos(ang0) * v,
    vy: CHUTE.vzBase + CHUTE.vzExtra * forca + (tipo === "chapada" ? t.chapadaVyExtra : t.trivelaVyExtra),
    vz: Math.sin(ang0) * v,
    forca,
    // O referencial espelhado do Visitante inverte o sentido do giro em relação ao rumo real
    giro: giroNoReferencialDoAtaque * ataque,
    tipo,
  };
}
