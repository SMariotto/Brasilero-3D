/** Limite de mensagens por segundo de uma conexão (janela fixa de 1 s). O que passa do limite é descartado. */
export class LimiteTaxa {
  private inicioJanela = 0;
  private contagem = 0;

  constructor(
    private readonly maxPorSegundo: number,
    private readonly agora: () => number = Date.now,
  ) {}

  permitir(): boolean {
    const t = this.agora();
    if (t - this.inicioJanela >= 1000) {
      this.inicioJanela = t;
      this.contagem = 0;
    }
    this.contagem++;
    return this.contagem <= this.maxPorSegundo;
  }
}
