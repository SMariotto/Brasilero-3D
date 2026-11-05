// Mantém a tela do celular acesa durante o jogo (Wake Lock). Sem isso o celular apaga a tela no meio da partida.
// O navegador solta o bloqueio sozinho quando a aba some; por isso pedimos de novo quando ela volta.

interface Sentinela {
  release(): Promise<void>;
  addEventListener(tipo: "release", fn: () => void): void;
}

export interface AmbienteDaTela {
  wakeLock?: { request(tipo: "screen"): Promise<Sentinela> };
  /** "visible" ou "hidden". */
  visibilidade(): string;
  aoMudarVisibilidade(fn: () => void): void;
}

/** O ambiente real do navegador. */
export function ambienteDoNavegador(): AmbienteDaTela {
  const nav = navigator as unknown as { wakeLock?: AmbienteDaTela["wakeLock"] };
  return {
    ...(nav.wakeLock ? { wakeLock: nav.wakeLock } : {}),
    visibilidade: () => document.visibilityState,
    aoMudarVisibilidade: (fn) => document.addEventListener("visibilitychange", fn),
  };
}

export class TelaAcesa {
  private querido = false;
  private sentinela: Sentinela | null = null;
  private pedindo = false;

  constructor(private readonly amb: AmbienteDaTela = ambienteDoNavegador()) {
    this.amb.aoMudarVisibilidade(() => {
      if (this.querido && this.amb.visibilidade() === "visible") void this.pedir();
    });
  }

  /** Liga: quer a tela acesa enquanto durar o jogo. Chame dentro de um toque (alguns navegadores exigem). */
  ligar(): void {
    this.querido = true;
    void this.pedir();
  }

  desligar(): void {
    this.querido = false;
    const s = this.sentinela;
    this.sentinela = null;
    if (s) void s.release().catch(() => undefined);
  }

  get ativo(): boolean {
    return this.sentinela !== null;
  }

  private async pedir(): Promise<void> {
    if (!this.amb.wakeLock || this.sentinela || this.pedindo || this.amb.visibilidade() !== "visible") return;
    this.pedindo = true;
    try {
      const s = await this.amb.wakeLock.request("screen");
      if (!this.querido) {
        // Desligaram enquanto o pedido estava no ar
        void s.release().catch(() => undefined);
        return;
      }
      this.sentinela = s;
      s.addEventListener("release", () => {
        if (this.sentinela === s) this.sentinela = null;
      });
    } catch {
      // Sem permissão (economia de bateria, navegador sem suporte): o jogo segue, só a tela pode apagar
    } finally {
      this.pedindo = false;
    }
  }
}
