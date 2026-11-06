import { BOLA, CHUTE, PASSE } from "../constantes";
import type { Campo } from "../fisica/campo";
import type { Rng } from "../util/rng";
import { grausParaRad, limitar } from "../util/vetor";

export interface VelocidadeBola {
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Mira assistida (SPEC 6.5): se a direção do chute aponta para a região do gol (até 25° para fora da trave),
 * puxa até 12° para dentro do gol. `time` é quem chuta: a Casa (0) ataca o gol de X positivo, o Visitante (1) o de X negativo.
 * Devolve o novo ângulo (radianos, atan2(dz, dx)).
 */
export function miraAssistida(px: number, pz: number, angulo: number, campo: Campo, time: 0 | 1): number {
  // Espelha para o Visitante atacar o mesmo lado que a Casa.
  const espelho = time === 1;
  const x = espelho ? -px : px;
  const a = espelho ? Math.PI - angulo : angulo;

  const dx = campo.metadeComp - x;
  if (dx < 0.5) return angulo; // colado na linha de fundo ou atrás dela: sem ajuda

  const metade = campo.golLarg / 2;
  const traveA = Math.atan2(-metade - pz, dx);
  const traveB = Math.atan2(metade - pz, dx);
  const baixo = Math.min(traveA, traveB);
  const alto = Math.max(traveA, traveB);
  const margem = grausParaRad(CHUTE.miraMargemGraus);
  const puxa = grausParaRad(CHUTE.miraPuxaGraus);

  let novo = a;
  if (a < baixo && a >= baixo - margem) novo = a + Math.min(puxa, baixo - a);
  else if (a > alto && a <= alto + margem) novo = a - Math.min(puxa, a - alto);

  return espelho ? Math.PI - novo : novo;
}

export interface EntradaChute {
  /** Carga de 0 a 1 medida no celular. Toque rápido vale `CHUTE.forcaToque`. */
  forca: number;
  /** Direção do chute (vetor de comprimento 1 no plano XZ). */
  dirX: number;
  dirZ: number;
  px: number;
  pz: number;
  time: 0 | 1;
  campo: Campo;
  rng: Rng;
  /** Erro angular extra (graus), somado ao sorteado: os bots erram mais ou menos conforme a dificuldade. */
  erroExtraGraus?: number;
}

/** Velocidade da bola num chute (SPEC 6.5): 14 + 16·força na horizontal, 1 + 5·força na vertical, com mira assistida e erro. */
export function calcularChute(e: EntradaChute): VelocidadeBola & { forca: number } {
  const forca = limitar(e.forca, CHUTE.forcaToque, 1);
  let angulo = Math.atan2(e.dirZ, e.dirX);
  angulo = miraAssistida(e.px, e.pz, angulo, e.campo, e.time);

  const erroMax = forca > CHUTE.erroAltoForca ? CHUTE.erroAltoGraus : CHUTE.erroGraus;
  angulo += grausParaRad(e.rng.entre(-erroMax, erroMax) + (e.erroExtraGraus ?? 0));

  const rapidez = CHUTE.velocidadeBase + CHUTE.velocidadeExtra * forca;
  return {
    vx: Math.cos(angulo) * rapidez,
    vy: CHUTE.vzBase + CHUTE.vzExtra * forca,
    vz: Math.sin(angulo) * rapidez,
    forca,
  };
}

export interface Alvo {
  slot: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface Ponto {
  x: number;
  z: number;
}

export interface ResultadoPasse extends VelocidadeBola {
  /** Companheiro escolhido (ou `undefined` se foi sem alvo). */
  para?: number;
  alto: boolean;
  /** Distância (m) do ponto de onde a bola saiu até o ponto de encontro mirado (H3): serve para saber o "último terço" do trajeto. */
  distancia?: number;
}

const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/** Menor distância do ponto (px, pz) ao segmento (ax, az)-(bx, bz). */
function distanciaAoSegmento(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const c2 = dx * dx + dz * dz;
  const t = c2 > 0 ? limitar(((px - ax) * dx + (pz - az) * dz) / c2, 0, 1) : 0;
  return dist(px, pz, ax + dx * t, az + dz * t);
}

/** Nota de um companheiro para receber o passe (SPEC 6.4): alinhamento 0,6 + distância ideal 0,25 + linha livre 0,15. */
export function notaDoPasse(de: Ponto, dirX: number, dirZ: number, alvo: Ponto, adversarios: Ponto[], coneGraus: number = PASSE.coneGraus): number {
  const d = dist(de.x, de.z, alvo.x, alvo.z);
  if (d < 0.5) return 0;
  const cos = limitar(((alvo.x - de.x) * dirX + (alvo.z - de.z) * dirZ) / d, -1, 1);
  const angulo = Math.acos(cos);
  const meio = grausParaRad(coneGraus / 2);
  const alinhamento = limitar(1 - angulo / meio, 0, 1);

  let distancia = 1;
  if (d < PASSE.distanciaIdealMin) distancia = limitar(1 - (PASSE.distanciaIdealMin - d) / PASSE.distanciaIdealMin, 0, 1);
  else if (d > PASSE.distanciaIdealMax) distancia = limitar(1 - (d - PASSE.distanciaIdealMax) / PASSE.distanciaIdealMax, 0, 1);

  let perto = Infinity;
  for (const a of adversarios) perto = Math.min(perto, distanciaAoSegmento(a.x, a.z, de.x, de.z, alvo.x, alvo.z));
  const linha = limitar(perto / 2, 0, 1);

  return PASSE.pesoAlinhamento * alinhamento + PASSE.pesoDistancia * distancia + PASSE.pesoLinhaLivre * linha;
}

export interface EntradaPasse {
  de: Ponto;
  /** Direção do joystick, ou para onde o jogador olha se o joystick está solto (vetor de comprimento 1). */
  dirX: number;
  dirZ: number;
  companheiros: Alvo[];
  adversarios: Ponto[];
  /** Lançamento por cima (PASSE segurado) em vez de rasteiro. */
  alto: boolean;
  /** Para onde o time ataca: +1 (gol de X positivo) ou -1. Só importa no lançamento (o mais avançado). */
  ataque: 1 | -1;
  /** Abertura total do cone de busca (graus). Padrão 60; os bots usam um cone maior. */
  coneGraus?: number;
  /** Erro angular (graus) somado à direção final (bots). */
  erroGraus?: number;
  /** O joystick está solto: escolhe o companheiro mais à frente e livre, em vez do mais alinhado com a direção (H1). */
  semDirecao?: boolean;
  /** Quanto a bola vai para onde o companheiro vai estar, de 0 a 1 (H1). Padrão 1 (bots e testes antigos). */
  forcaDaAjuda?: number;
  /** Metades do campo, para a mira não sair das linhas (H1). */
  campo?: { metadeComp: number; metadeLarg: number };
  /** Sem ninguém no cone, vai para o companheiro mais perto da direção do joystick em vez de sair reto (H3, passe do humano). */
  maisProximoDaDirecao?: boolean;
}

/**
 * Em quanto tempo uma bola rasteira lançada a `v0` percorre `d` (H1), integrando a mesma desaceleração da física da bola (atrito da
 * grama mais arrasto do ar, que cresce com o quadrado da velocidade). Se a bola para antes de chegar, devolve o tempo até parar.
 */
export function tempoDeVoo(d: number, v0: number, fator = 1): number {
  const dt = 1 / 60;
  let v = v0;
  let x = 0;
  let t = 0;
  while (v > BOLA.velocidadeParada && t < 10) {
    const v1 = Math.max(0, v - (BOLA.atritoChao + BOLA.arrasto * v * v) * fator * dt);
    const passo = ((v + v1) / 2) * dt;
    if (x + passo >= d) return t + (passo > 0 ? ((d - x) / passo) * dt : 0); // acerta o último passo
    x += passo;
    v = v1;
    t += dt;
  }
  return t;
}

/** Sem joystick (H1): o companheiro mais à frente e com a linha livre de adversários, perto da distância ideal. */
function escolherMaisAFrenteELivre(e: EntradaPasse): Alvo | null {
  let melhor: Alvo | null = null;
  let melhorNota = -Infinity;
  for (const c of e.companheiros) {
    const d = dist(e.de.x, e.de.z, c.x, c.z);
    if (d < 2) continue;
    const avanco = limitar(0.5 + ((c.x - e.de.x) * e.ataque) / PASSE.semDirecaoAvancoM, 0, 1);
    let perto = Infinity;
    for (const a of e.adversarios) perto = Math.min(perto, distanciaAoSegmento(a.x, a.z, e.de.x, e.de.z, c.x, c.z));
    const livre = limitar(perto / 3, 0, 1);
    let distancia = 1;
    if (d < PASSE.distanciaIdealMin) distancia = limitar(d / PASSE.distanciaIdealMin, 0, 1);
    else if (d > PASSE.distanciaIdealMax) distancia = limitar(1 - (d - PASSE.distanciaIdealMax) / PASSE.distanciaIdealMax, 0, 1);
    const nota = PASSE.semDirecaoPesoAvanco * avanco + PASSE.semDirecaoPesoLivre * livre + PASSE.semDirecaoPesoDistancia * distancia;
    if (nota > melhorNota) {
      melhor = c;
      melhorNota = nota;
    }
  }
  return melhor;
}

/** Companheiro dentro do cone, ou `null`: rasteiro escolhe o de maior nota; lançamento escolhe o mais avançado. */
export function escolherAlvoDoPasse(e: EntradaPasse): Alvo | null {
  if (e.semDirecao && !e.alto) return escolherMaisAFrenteELivre(e);
  const cone = e.coneGraus ?? PASSE.coneGraus;
  const meio = grausParaRad(cone / 2);
  let melhor: Alvo | null = null;
  let melhorValor = -Infinity;
  for (const c of e.companheiros) {
    const d = dist(e.de.x, e.de.z, c.x, c.z);
    if (d < 1) continue;
    const cos = limitar(((c.x - e.de.x) * e.dirX + (c.z - e.de.z) * e.dirZ) / d, -1, 1);
    if (Math.acos(cos) > meio) continue;
    const valor = e.alto ? c.x * e.ataque : notaDoPasse(e.de, e.dirX, e.dirZ, c, e.adversarios, cone);
    if (valor > melhorValor) {
      melhor = c;
      melhorValor = valor;
    }
  }
  if (melhor || !e.maisProximoDaDirecao) return melhor;
  // H3: ninguém no cone, mas o passe do humano nunca sai sem destino: o companheiro mais perto da direção do joystick
  let menorAngulo = Infinity;
  for (const c of e.companheiros) {
    const d = dist(e.de.x, e.de.z, c.x, c.z);
    if (d < 1) continue;
    const angulo = Math.acos(limitar(((c.x - e.de.x) * e.dirX + (c.z - e.de.z) * e.dirZ) / d, -1, 1));
    if (angulo < menorAngulo) {
      melhor = c;
      menorAngulo = angulo;
    }
  }
  return melhor;
}

/**
 * Passe com mira assistida (SPEC 6.4).
 * Rasteiro: velocidade `limitar(6 + 0,9·distância, 8, 16)` mirando onde o companheiro vai estar.
 * Lançamento: por cima, velocidade vertical de 5 a 9 m/s conforme a distância, caindo perto do companheiro.
 * Sem companheiro no cone: sai reto na direção pedida.
 */
export function calcularPasseAssistido(e: EntradaPasse): ResultadoPasse {
  const alvo = escolherAlvoDoPasse(e);
  let dirX = e.dirX;
  let dirZ = e.dirZ;
  let rapidez: number = PASSE.velocidadeSemAlvo;
  let vy = 0;
  let distancia: number | undefined;

  if (alvo) {
    // Onde o companheiro estará quando a bola chegar: refina o ponto de encontro (ele anda enquanto a bola viaja)
    let px = alvo.x;
    let pz = alvo.z;
    for (let i = 0; i < PASSE.iteracoesDeMira; i++) {
      const d = dist(e.de.x, e.de.z, px, pz);
      let tempo: number;
      if (e.alto) {
        vy = limitar(PASSE.lancamentoVzMin + ((d - 5) / 20) * (PASSE.lancamentoVzMax - PASSE.lancamentoVzMin), PASSE.lancamentoVzMin, PASSE.lancamentoVzMax);
        tempo = (2 * vy) / BOLA.gravidade;
        rapidez = Math.min(24, (d / tempo) * 1.06);
      } else {
        rapidez = limitar(PASSE.velocidadeBase + PASSE.velocidadePorMetro * d, PASSE.velocidadeMin, PASSE.velocidadeMax);
        tempo = tempoDeVoo(d, rapidez, PASSE.desaceleracaoFator); // a bola vai perdendo velocidade: demora mais que d / rapidez
      }
      px = alvo.x + alvo.vx * tempo;
      pz = alvo.z + alvo.vz * tempo;
      if (e.campo) {
        px = limitar(px, -e.campo.metadeComp + PASSE.margemDoCampoM, e.campo.metadeComp - PASSE.margemDoCampoM);
        pz = limitar(pz, -e.campo.metadeLarg + PASSE.margemDoCampoM, e.campo.metadeLarg - PASSE.margemDoCampoM);
      }
    }
    const d = dist(e.de.x, e.de.z, px, pz);
    distancia = d;
    if (d > 0.01) {
      // A ajuda mistura a direção do joystick com a da mira: força 1 vai em cheio no ponto de encontro
      const forca = limitar(e.forcaDaAjuda ?? 1, 0, 1);
      const mx = (px - e.de.x) / d;
      const mz = (pz - e.de.z) / d;
      const bx = e.dirX * (1 - forca) + mx * forca;
      const bz = e.dirZ * (1 - forca) + mz * forca;
      const n = Math.hypot(bx, bz);
      if (n > 1e-6) {
        dirX = bx / n;
        dirZ = bz / n;
      }
    }
  } else if (e.alto) {
    vy = (PASSE.lancamentoVzMin + PASSE.lancamentoVzMax) / 2;
  }

  if (e.erroGraus) {
    const a = Math.atan2(dirZ, dirX) + grausParaRad(e.erroGraus);
    dirX = Math.cos(a);
    dirZ = Math.sin(a);
  }

  return {
    vx: dirX * rapidez,
    vy,
    vz: dirZ * rapidez,
    ...(alvo ? { para: alvo.slot } : {}),
    alto: e.alto,
    ...(distancia !== undefined ? { distancia } : {}),
  };
}
