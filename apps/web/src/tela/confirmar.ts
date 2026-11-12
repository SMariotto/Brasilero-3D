// Confirmação com dois cliques (H7.2): o primeiro clique num botão que destrói alguma coisa (expulsar um jogador) só "arma" o botão, e o
// segundo, dentro do prazo, confirma. Parecido com o "Zerar campeonato" do celular. O relógio e o aviso de redesenho entram por
// parâmetro: lógica pura, com teste.

export class Confirmacao {
  private id: number | null = null;
  private ate = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * @param prazoMs quanto tempo o botão fica armado depois do primeiro clique
   * @param agora hora em ms (o relógio do navegador, ou o de mentira do teste)
   * @param aoMudar chamada quando o botão armado volta ao normal (pelo prazo): é hora de redesenhar
   */
  constructor(
    private readonly prazoMs: number,
    private readonly agora: () => number,
    private readonly aoMudar: () => void = () => undefined,
  ) {}

  /** O botão deste `id` está armado (esperando o segundo clique)? */
  pendente(id: number): boolean {
    return this.id === id && this.agora() < this.ate;
  }

  /**
   * Um clique no botão deste `id`. Devolve `true` se é o segundo clique dentro do prazo (confirmou: pode agir); senão arma o botão
   * (e desarma qualquer outro) e devolve `false`.
   */
  clicar(id: number): boolean {
    if (this.pendente(id)) {
      this.limpar();
      this.aoMudar();
      return true;
    }
    this.limpar();
    this.id = id;
    this.ate = this.agora() + this.prazoMs;
    this.timer = setTimeout(() => {
      this.limpar();
      this.aoMudar();
    }, this.prazoMs);
    this.aoMudar();
    return false;
  }

  private limpar(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.id = null;
    this.ate = 0;
  }
}
