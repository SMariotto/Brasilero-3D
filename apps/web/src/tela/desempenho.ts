// Medidor de desempenho e modo leve automático (SPEC 7.3 e 7.4): se o telão ficar abaixo de 45 fps por 3 s seguidos, desliga
// sombras, torcida 3D e pós-processamento. Também dá para forçar no menu (tecla L). A lógica é pura e tem teste.

export const FPS_MINIMO = 45;
export const SEGUNDOS_ABAIXO = 3;

export interface EstadoFps {
  /** Quadros por segundo medidos na última janela de 0,5 s. */
  fps: number;
  /** O modo leve está ligado (automático ou forçado). */
  leve: boolean;
}

/**
 * Conta os quadros e decide quando ligar o modo leve. `quadro(dtMs)` é chamado a cada quadro desenhado com o tempo
 * desde o quadro anterior. O modo leve automático só liga, nunca desliga sozinho (evita ficar ligando e desligando).
 */
export class MedidorFps {
  private acumuladoMs = 0;
  private quadros = 0;
  private abaixoMs = 0;
  fps = 60;
  leve = false;
  /** Quem ligou: `automatico` pelo medidor, `manual` pela tecla L. */
  motivo: "automatico" | "manual" | null = null;

  constructor(
    private readonly aoLigarLeve: () => void = () => undefined,
    private readonly aoDesligarLeve: () => void = () => undefined,
  ) {}

  quadro(dtMs: number): EstadoFps {
    // Quadros muito longos (aba em segundo plano, engasgo de segundos) não contam: não é o PC ruim, é a aba parada.
    if (dtMs > 1000) return { fps: this.fps, leve: this.leve };
    this.acumuladoMs += dtMs;
    this.quadros++;

    if (this.acumuladoMs >= 500) {
      this.fps = (this.quadros * 1000) / this.acumuladoMs;
      if (!this.leve) {
        if (this.fps < FPS_MINIMO) {
          this.abaixoMs += this.acumuladoMs;
          if (this.abaixoMs >= SEGUNDOS_ABAIXO * 1000) this.ligar("automatico");
        } else {
          this.abaixoMs = 0;
        }
      }
      this.acumuladoMs = 0;
      this.quadros = 0;
    }
    return { fps: this.fps, leve: this.leve };
  }

  private ligar(motivo: "automatico" | "manual"): void {
    if (this.leve) return;
    this.leve = true;
    this.motivo = motivo;
    this.abaixoMs = 0;
    this.aoLigarLeve();
  }

  /** Liga ou desliga na mão (menu, tecla L). Desligar também zera a contagem, para o medidor poder ligar de novo se precisar. */
  alternar(): boolean {
    if (this.leve) {
      this.leve = false;
      this.motivo = null;
      this.abaixoMs = 0;
      this.aoDesligarLeve();
    } else {
      this.ligar("manual");
    }
    return this.leve;
  }
}

/** Painel pequeno com fps, chamadas de desenho e triângulos; só aparece com `?debug=1`. */
export class PainelDebug {
  readonly elemento: HTMLElement;

  constructor() {
    this.elemento = document.createElement("pre");
    this.elemento.className = "painel-debug";
    this.elemento.id = "painel-debug";
  }

  atualizar(dados: { fps: number; leve: boolean; motivo: string | null; chamadas: number; triangulos: number; geometrias: number; texturas: number; atrasoMs: number }): void {
    this.elemento.textContent =
      `fps ${dados.fps.toFixed(0)}  ${dados.leve ? `MODO LEVE (${dados.motivo})` : "modo normal"}\n` +
      `draw calls ${dados.chamadas}  triângulos ${dados.triangulos}\n` +
      `geometrias ${dados.geometrias}  texturas ${dados.texturas}\n` +
      `atraso de interpolação ${dados.atrasoMs.toFixed(0)} ms`;
  }
}
