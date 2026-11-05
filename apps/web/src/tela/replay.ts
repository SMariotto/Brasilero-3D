import { TEMPO, type Snapshot } from "@b3d/core";
import { amostrarEmTick, type Amostra } from "./interpolacao";

// Replay do gol (SPEC 7.3): o telão guarda os últimos 6 s de snapshots e, depois do GOOOL, reproduz o lance em câmera lenta
// por trás do gol. Tudo roda no telão; o servidor só segura a comemoração por tempo suficiente (PARTIDA.golComemoracaoS).

/** Quanto jogo o telão guarda, em segundos. */
export const JANELA_S = 6;
/** Do lance: quanto antes do gol e quanto depois. */
export const ANTES_DO_GOL_S = 3.2;
export const DEPOIS_DO_GOL_S = 0.4;
/** Velocidade da câmera lenta. */
export const VELOCIDADE = 0.8;

/** Guarda os snapshots recentes. */
export class GravadorDeReplay {
  private buf: Snapshot[] = [];

  /** Esquece tudo (partida nova). */
  reiniciar(): void {
    this.buf = [];
  }

  get tamanho(): number {
    return this.buf.length;
  }

  capturar(s: Snapshot): void {
    const ultimo = this.buf[this.buf.length - 1];
    if (ultimo && s.tick <= ultimo.tick) {
      if (s.tick < ultimo.tick) this.buf = []; // o tick voltou: partida nova
      else return; // repetido
    }
    this.buf.push(s);
    const minimo = s.tick - JANELA_S * TEMPO.tickHz;
    while (this.buf.length > 2 && this.buf[0]!.tick < minimo) this.buf.shift();
  }

  /** O pedaço do jogo em volta do gol que aconteceu no tick `tickGol`. Vazio se não há nada guardado perto. */
  trecho(tickGol: number): Snapshot[] {
    const de = tickGol - ANTES_DO_GOL_S * TEMPO.tickHz;
    const ate = tickGol + DEPOIS_DO_GOL_S * TEMPO.tickHz;
    return this.buf.filter((s) => s.tick >= de && s.tick <= ate);
  }
}

/** Uma reprodução em andamento. */
export class Reproducao {
  private readonly tickInicial: number;
  private readonly tickFinal: number;

  constructor(
    private readonly snaps: Snapshot[],
    /** Hora (ms, relógio local) em que começou. */
    private readonly inicioMs: number,
    /** Qual gol está sendo repetido: +1 = gol de X positivo (a Casa marcou). */
    readonly lado: 1 | -1,
    private readonly velocidade: number = VELOCIDADE,
  ) {
    this.tickInicial = snaps[0]?.tick ?? 0;
    this.tickFinal = snaps[snaps.length - 1]?.tick ?? 0;
  }

  get vazia(): boolean {
    return this.snaps.length < 2;
  }

  /** Duração em segundos de relógio real. */
  get duracaoS(): number {
    return (this.tickFinal - this.tickInicial) / TEMPO.tickHz / this.velocidade;
  }

  terminou(agoraMs: number): boolean {
    return this.vazia || (agoraMs - this.inicioMs) / 1000 >= this.duracaoS;
  }

  amostrar(agoraMs: number): Amostra | null {
    const tick = this.tickInicial + ((agoraMs - this.inicioMs) / 1000) * TEMPO.tickHz * this.velocidade;
    return amostrarEmTick(this.snaps, tick);
  }
}
