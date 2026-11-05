/** Um botão grande da tela: guarda se está apertado e desde quando. Cada botão tem o próprio ponteiro (multitoque). */
export class Botao {
  apertado = false;
  /** Hora (performance.now) em que foi apertado. */
  desde = 0;
  private id: number | null = null;

  constructor(
    readonly elemento: HTMLElement,
    private readonly aoApertar: (b: Botao) => void,
    private readonly aoSoltar: (b: Botao, duracaoMs: number) => void,
  ) {
    elemento.addEventListener("pointerdown", this.baixo);
    elemento.addEventListener("pointerup", this.cima);
    elemento.addEventListener("pointercancel", this.cima);
    elemento.addEventListener("lostpointercapture", this.cima);
  }

  rotulo(texto: string): void {
    this.elemento.textContent = texto;
  }

  /** Solta na marra (a tela do jogo fechou com o dedo ainda no botão). */
  zerar(): void {
    this.apertado = false;
    this.id = null;
    this.elemento.classList.remove("apertado");
  }

  private readonly baixo = (e: PointerEvent): void => {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    this.elemento.setPointerCapture(e.pointerId);
    this.apertado = true;
    this.desde = performance.now();
    // iPhone não vibra em site: o botão "afunda" e pisca (SPEC 5.2)
    this.elemento.classList.add("apertado");
    this.aoApertar(this);
  };

  private readonly cima = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.apertado = false;
    this.elemento.classList.remove("apertado");
    this.aoSoltar(this, performance.now() - this.desde);
  };
}
