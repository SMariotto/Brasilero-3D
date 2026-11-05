import type { Lobby, MensagemServidor } from "@b3d/core";
import type { Canal } from "./sala";

/** Aparelho falso para os testes: guarda tudo o que a sala mandou (JSON e binário). */
export class CanalFalso implements Canal {
  recebidas: MensagemServidor[] = [];
  binarias: Uint8Array[] = [];
  fechadoCom: number | null = null;

  enviar(msg: MensagemServidor): void {
    this.recebidas.push(msg);
  }

  enviarBinario(dados: Uint8Array): void {
    this.binarias.push(dados);
  }

  fechar(codigo = 1000): void {
    this.fechadoCom = codigo;
  }

  ultimas<T extends MensagemServidor["t"]>(tipo: T): Extract<MensagemServidor, { t: T }>[] {
    return this.recebidas.filter((m): m is Extract<MensagemServidor, { t: T }> => m.t === tipo);
  }

  ultimoLobby(): Lobby {
    const l = this.ultimas("lobby");
    return l[l.length - 1] as Lobby;
  }

  ultimoErro(): string | undefined {
    const e = this.ultimas("erro");
    return e[e.length - 1]?.codigo;
  }
}
