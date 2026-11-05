import { CONTROLE } from "@b3d/core";

/**
 * Joystick dinâmico (SPEC 5.1): o lado esquerdo inteiro da tela é a zona; o centro aparece onde o dedo encosta.
 * Raio de 60 px, zona morta de 10%. Pointer Events com captura, para funcionar junto com os botões (multitoque).
 */
export class Joystick {
  /** Direção em radianos: 0 = direita da tela, sentido anti-horário (cima = π/2). */
  ang = 0;
  /** Força de 0 a 1, já descontada a zona morta. */
  mag = 0;

  private id: number | null = null;
  private origemX = 0;
  private origemY = 0;

  constructor(
    private readonly zona: HTMLElement,
    private readonly base: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly aoMudar: () => void,
  ) {
    zona.addEventListener("pointerdown", this.baixo);
    zona.addEventListener("pointermove", this.mover);
    zona.addEventListener("pointerup", this.soltar);
    zona.addEventListener("pointercancel", this.soltar);
    zona.addEventListener("lostpointercapture", this.soltar);
  }

  /** Larga o dedo (usado quando a tela do jogo fecha). */
  zerar(): void {
    this.id = null;
    this.ang = 0;
    this.mag = 0;
    this.base.hidden = true;
  }

  private readonly baixo = (e: PointerEvent): void => {
    if (this.id !== null) return; // um dedo só no joystick
    e.preventDefault();
    this.id = e.pointerId;
    this.zona.setPointerCapture(e.pointerId);
    const r = this.zona.getBoundingClientRect();
    this.origemX = e.clientX;
    this.origemY = e.clientY;
    this.base.hidden = false;
    this.base.style.left = `${this.origemX - r.left}px`;
    this.base.style.top = `${this.origemY - r.top}px`;
    this.knob.style.transform = "translate(-50%, -50%)";
    this.atualizar(e.clientX, e.clientY);
  };

  private readonly mover = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    this.atualizar(e.clientX, e.clientY);
  };

  private readonly soltar = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.mag = 0;
    this.base.hidden = true;
    this.aoMudar();
  };

  private atualizar(x: number, y: number): void {
    const dx = x - this.origemX;
    const dy = y - this.origemY;
    const dist = Math.hypot(dx, dy);
    const bruto = Math.min(1, dist / CONTROLE.joystickRaioPx);

    // Zona morta: abaixo de 10% não conta; acima dela a força é reescalada para ir de 0 a 1.
    const zm = CONTROLE.joystickZonaMorta;
    this.mag = bruto < zm ? 0 : (bruto - zm) / (1 - zm);
    if (dist > 0) this.ang = Math.atan2(-dy, dx); // o eixo Y da tela cresce para baixo

    // O botão acompanha o dedo, limitado ao raio
    const k = dist > CONTROLE.joystickRaioPx ? CONTROLE.joystickRaioPx / dist : 1;
    this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    this.aoMudar();
  }
}
