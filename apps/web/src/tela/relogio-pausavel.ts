// Um relógio que não anda enquanto o jogo está pausado (H7.3). O telão mede algumas coisas em hora real do navegador (a espera de 1,5 s antes
// do replay do gol e o replay em si). Com a partida pausada elas têm de parar junto, senão o replay "passa" por trás da tela de pausa e
// acaba sozinho. A hora do jogo é a do navegador menos o tempo todo que ficou pausado. Lógica pura, com teste.

export class RelogioPausavel {
  private pausadoDesde: number | null = null;
  private tempoPausado = 0;

  /** A hora do jogo para a hora `agora` do navegador. Pausado, fica parada na hora em que pausou. */
  jogo(agora: number): number {
    const fim = this.pausadoDesde ?? agora;
    return fim - this.tempoPausado;
  }

  /** Começa a pausa. Pausar de novo não conta duas vezes. */
  pausar(agora: number): void {
    if (this.pausadoDesde === null) this.pausadoDesde = agora;
  }

  /** Fim da pausa: o tempo parado entra na conta e a hora do jogo segue de onde estava. */
  retomar(agora: number): void {
    if (this.pausadoDesde === null) return;
    this.tempoPausado += Math.max(0, agora - this.pausadoDesde);
    this.pausadoDesde = null;
  }

  get pausado(): boolean {
    return this.pausadoDesde !== null;
  }
}
