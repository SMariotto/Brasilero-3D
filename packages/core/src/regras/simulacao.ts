import { TEMPO, type Dificuldade } from "../constantes";
import { ACAO, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { CONFIG_PADRAO, type Config } from "../protocolo/config";
import { Partida } from "./partida";

// Simulações de partida sem rede e sem navegador (G2): servem ao simulador `npm run simular` e aos testes de dificuldade dos bots.
// Com semente fixa o resultado é sempre o mesmo.

export interface OpcoesSimulacao {
  modo?: Config["modo"];
  n?: Config["n"];
  /** Duração do jogo em segundos (o relógio é ajustado para isso). */
  segundos: number;
}

export interface ResultadoBots {
  gols: [number, number];
  posseTicks: [number, number];
  passes: [number, number];
  chutes: [number, number];
  botes: [number, number];
  carrinhos: [number, number];
  desarmesBote: [number, number];
  desarmesCarrinho: [number, number];
  /** Quantas vezes a bola mudou de time. */
  viradas: number;
  faltas: number;
  /** H4: passos (1/60 s) com a bola nas mãos ou nos pés do goleiro de cada time. */
  posseGoleiroTicks: [number, number];
  /** H4: gols contra feitos por cada time (o time que fez o gol contra). */
  golsContra: [number, number];
}

const timeDe = (slot: number): 0 | 1 => (slot < 6 ? 0 : 1);

function configDe(dificuldade: Dificuldade, o: OpcoesSimulacao): Config {
  return {
    ...CONFIG_PADRAO,
    modo: o.modo ?? "campo",
    n: o.n ?? 5,
    duracao: Math.max(2, Math.ceil(o.segundos / 60)) as Config["duracao"],
    dificuldade,
  };
}

/** Bots contra bots, cada time com a sua dificuldade. */
export function simularBots(casa: Dificuldade, visitante: Dificuldade, semente: number, o: OpcoesSimulacao): ResultadoBots {
  const p = new Partida({ config: configDe(casa, o), elenco: [], semente, dificuldades: [casa, visitante] });
  p.definirRelogioParaTeste(o.segundos);
  const r: ResultadoBots = {
    gols: [0, 0],
    posseTicks: [0, 0],
    passes: [0, 0],
    chutes: [0, 0],
    botes: [0, 0],
    carrinhos: [0, 0],
    desarmesBote: [0, 0],
    desarmesCarrinho: [0, 0],
    viradas: 0,
    faltas: 0,
    posseGoleiroTicks: [0, 0],
    golsContra: [0, 0],
  };
  let ultimoTime: 0 | 1 | null = null;
  const limite = TEMPO.tickHz * (o.segundos + 120);
  for (let i = 0; i < limite && !p.terminou; i++) {
    p.passo();
    if (p.dominante !== null) {
      const tm = timeDe(p.dominante);
      r.posseTicks[tm]++;
      if (p.jogador(p.dominante)?.vaga.goleiro) r.posseGoleiroTicks[tm]++;
      if (ultimoTime !== null && ultimoTime !== tm) r.viradas++;
      ultimoTime = tm;
    }
    for (const e of p.eventosPendentes()) {
      if (e.tipo === "passe") r.passes[timeDe(e.dados.de)]++;
      else if (e.tipo === "chute") r.chutes[timeDe(e.dados.slot)]++;
      else if (e.tipo === "roubo") (e.dados.jeito === "bote" ? r.desarmesBote : r.desarmesCarrinho)[timeDe(e.dados.slot)]++;
      else if (e.tipo === "falta") r.faltas++;
      else if (e.tipo === "gol" && e.dados.contra) r.golsContra[e.dados.time === 0 ? 1 : 0]++;
    }
  }
  r.gols = [p.placar[0], p.placar[1]];
  r.botes = [p.metricas.botesTentados[0]!, p.metricas.botesTentados[1]!];
  r.carrinhos = [p.metricas.carrinhosTentados[0]!, p.metricas.carrinhosTentados[1]!];
  return r;
}

export interface ResultadoDriblador {
  gols: number;
  sofridos: number;
  /** Vezes que o humano perdeu a bola num desarme dos bots (bote ou carrinho). */
  desarmado: number;
  /** Segundos com a bola nos pés. */
  comBolaS: number;
  /** Posses distintas do humano (cada vez que pega a bola). */
  posses: number;
}

/**
 * Um driblador humano de mentira (corre em zigue-zague, chuta de perto, sem a bola corre atrás dela)
 * contra bots de uma dificuldade: mede o que o jogador sente (os adversários pegam a bola de quem dribla?).
 */
export function simularDriblador(dificuldade: Dificuldade, semente: number, o: OpcoesSimulacao): ResultadoDriblador {
  const p = new Partida({
    config: configDe(dificuldade, o),
    elenco: [{ slot: 1, time: 0, numero: 7, nome: "Humano", humano: true, idControle: 1, goleiro: false }],
    semente,
  });
  p.definirRelogioParaTeste(o.segundos);
  const r: ResultadoDriblador = { gols: 0, sofridos: 0, desarmado: 0, comBolaS: 0, posses: 0 };
  let seq = 0;
  let tinha = false;
  let proximoChute = 0;
  const limite = TEMPO.tickHz * (o.segundos + 120);
  for (let i = 0; i < limite && !p.terminou; i++) {
    const h = p.jogador(1)!;
    const tem = p.dominante === 1;
    if (tem && !tinha) r.posses++;
    tinha = tem;
    if (tem) r.comBolaS += 1 / TEMPO.tickHz;

    const t = p.t;
    let alvoX: number;
    let alvoZ: number;
    let acao: { acao: number; forca: number } | null = null;
    if (tem) {
      const distGol = Math.hypot(p.campo.metadeComp - h.corpo.x, h.corpo.z);
      alvoX = p.campo.metadeComp;
      alvoZ = Math.sin(t * 4.2) * 5; // zigue-zague de ~1,5 s de período
      if (distGol < 17 && t >= proximoChute) {
        seq = (seq + 1) & 255;
        acao = { acao: ACAO.chute, forca: 220 };
        proximoChute = t + 3;
      }
    } else {
      alvoX = p.bola.x;
      alvoZ = p.bola.z;
    }
    const ang = Math.atan2(-(alvoZ - h.corpo.z), alvoX - h.corpo.x);
    const c: Comando = { ...comandoParado(), ang: anguloParaByte(ang), mag: magParaByte(1), seguros: 0 };
    if (acao) Object.assign(c, { acao: acao.acao, forca: acao.forca, acaoSeq: seq });
    p.definirComando(1, c);
    p.passo();
    for (const e of p.eventosPendentes()) if (e.tipo === "roubo" && e.dados.de === 1) r.desarmado++;
  }
  r.gols = p.placar[0];
  r.sofridos = p.placar[1];
  return r;
}

// ---------------------------------------------------------------------------
// Chutes (H2): taxa de gol por tipo, contra um goleiro de verdade
// ---------------------------------------------------------------------------

import { analisarChute, type TipoDeChute } from "./chute-tipos";

export interface ChuteSimulado {
  x: number;
  z: number;
  /** Tipo forçado (ou `"auto"`: o jogo escolhe) e o tipo que realmente saiu. */
  pedido: TipoDeChute | "auto";
  tipo: TipoDeChute;
  gol: boolean;
  /** Abertura do gol (graus) e distância (m) do jogador ao gol, no instante do chute. */
  abertura: number;
  distancia: number;
}

export interface OpcoesChutes {
  dificuldade?: Dificuldade;
  /** Quantas sementes (goleiros com sorteios diferentes) por posição. */
  sementes?: number;
  /** A força do chute (carga de 0 a 1) usada em todos. */
  forca?: number;
  /** Se há um zagueiro de linha marcando o atacante (pressão). */
  marcador?: boolean;
  /** Onde o atacante mira: o canto longe do goleiro (jogador bom) ou o meio do gol com imprecisão (jogador que só aponta para o gol). */
  mira?: "canto" | "centro";
}

/** Posições de chute: da frente do gol até longe, do centro até a linha lateral (Casa atacando X positivo). */
export function posicoesDeChute(n: Config["n"] = 5): Array<{ x: number; z: number }> {
  const campo = new Partida({ config: { ...CONFIG_PADRAO, n, modo: "campo" }, elenco: [], semente: 1, semBots: true }).campo;
  const lista: Array<{ x: number; z: number }> = [];
  for (const recuo of [6, 9, 13, 18, 24, 29]) {
    for (const z of [0, 3.5, 7, 11, 15]) {
      const x = campo.metadeComp - recuo;
      if (Math.abs(z) < campo.metadeLarg - 1) {
        lista.push({ x, z });
        if (z !== 0) lista.push({ x, z: -z });
      }
    }
  }
  return lista;
}

/** Um chute: o atacante (Casa, humano) com a bola mira no centro do gol; o goleiro (Visitante, bot) defende. Devolve se foi gol. */
export function simularChute(x: number, z: number, pedido: TipoDeChute | "auto", semente: number, o: OpcoesChutes = {}): ChuteSimulado {
  const elenco: Array<import("./partida").VagaPartida> = [
    { slot: 1, time: 0, numero: 7, nome: "Atacante", humano: true, idControle: 1, goleiro: false },
    { slot: 6, time: 1, numero: 1, nome: "Goleiro", humano: false, goleiro: true },
  ];
  if (o.marcador) elenco.push({ slot: 7, time: 1, numero: 4, nome: "Zagueiro", humano: false, goleiro: false });
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "campo", n: 5, dificuldade: o.dificuldade ?? "medio", duracao: 4 },
    elenco,
    semente,
    semBots: true,
  });
  const j = p.jogador(1)!;
  p.posicionarParaTeste(1, x, z, x + 0.55, z, 0);
  if (o.marcador) {
    const m = p.jogador(7)!;
    m.corpo.x = x + 1.5;
    m.corpo.z = z + 1.2;
  }
  for (let i = 0; i < 90; i++) p.passo(); // o goleiro toma posição e o atacante domina a bola
  j.cmd = { ...comandoParado() };
  const gx = p.campo.metadeComp;
  // O atacante mira no canto do gol mais longe do goleiro, com uma imprecisão de até 0,6 m (o goleiro é o do jogo, não o dos sorteios)
  const goleiro = p.jogador(6)!;
  const erroZ = ((semente % 7) - 3) * 0.2;
  const cantoZ = o.mira === "centro" ? erroZ * 3 : -Math.sign(goleiro.corpo.z || 1) * (p.campo.golLarg / 2 - 0.9) + erroZ;
  const dx = gx - j.corpo.x;
  const dz = cantoZ - j.corpo.z;
  const n = Math.hypot(dx, dz);
  const a = analisarChute({ px: j.corpo.x, pz: j.corpo.z, time: 0, campo: p.campo, dirX: dx / n, dirZ: dz / n }, { goleiro: null, adversarioMaisPertoM: Infinity });
  const tipo = p.chutarComTipo(j, o.forca ?? 0.85, dx / n, dz / n, pedido === "auto" ? undefined : pedido);
  for (let i = 0; i < 4 * 60 && p.placar[0] === 0; i++) p.passo();
  return { x, z, pedido, tipo, gol: p.placar[0] > 0, abertura: a.abertura, distancia: a.distancia };
}
