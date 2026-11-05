import { TEMPO, type Dificuldade } from "../constantes";
import { ACAO, BOTAO, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
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
  };
  let ultimoTime: 0 | 1 | null = null;
  const limite = TEMPO.tickHz * (o.segundos + 120);
  for (let i = 0; i < limite && !p.terminou; i++) {
    p.passo();
    if (p.dominante !== null) {
      const tm = timeDe(p.dominante);
      r.posseTicks[tm]++;
      if (ultimoTime !== null && ultimoTime !== tm) r.viradas++;
      ultimoTime = tm;
    }
    for (const e of p.eventosPendentes()) {
      if (e.tipo === "passe") r.passes[timeDe(e.dados.de)]++;
      else if (e.tipo === "chute") r.chutes[timeDe(e.dados.slot)]++;
      else if (e.tipo === "roubo") (e.dados.jeito === "bote" ? r.desarmesBote : r.desarmesCarrinho)[timeDe(e.dados.slot)]++;
      else if (e.tipo === "falta") r.faltas++;
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
 * Um driblador humano de mentira (corre em zigue-zague, arrancada metade do tempo, chuta de perto, sem a bola corre atrás dela)
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
    let botoes = 0;
    let acao: { acao: number; forca: number } | null = null;
    if (tem) {
      const distGol = Math.hypot(p.campo.metadeComp - h.corpo.x, h.corpo.z);
      alvoX = p.campo.metadeComp;
      alvoZ = Math.sin(t * 4.2) * 5; // zigue-zague de ~1,5 s de período
      if (Math.floor(t / 2.5) % 2 === 0) botoes |= BOTAO.correr; // metade do tempo em arrancada
      if (distGol < 17 && t >= proximoChute) {
        seq = (seq + 1) & 255;
        acao = { acao: ACAO.chute, forca: 220 };
        proximoChute = t + 3;
      }
    } else {
      alvoX = p.bola.x;
      alvoZ = p.bola.z;
      botoes |= BOTAO.correr;
    }
    const ang = Math.atan2(-(alvoZ - h.corpo.z), alvoX - h.corpo.x);
    const c: Comando = { ...comandoParado(), ang: anguloParaByte(ang), mag: magParaByte(1), seguros: botoes };
    if (acao) Object.assign(c, { acao: acao.acao, forca: acao.forca, acaoSeq: seq });
    p.definirComando(1, c);
    p.passo();
    for (const e of p.eventosPendentes()) if (e.tipo === "roubo" && e.dados.de === 1) r.desarmado++;
  }
  r.gols = p.placar[0];
  r.sofridos = p.placar[1];
  return r;
}
