import * as THREE from "three";
import type { BolaSnap, CampoMsg } from "@b3d/core";

export type ModoCamera = "tv" | "aerea" | "jogador";


const FOV = 35;
/** Inclinação da câmera de TV, em radianos acima do campo (como a transmissão). */
const INCLINACAO = (38 * Math.PI) / 180;
const DISTANCIA_MIN = 22;
/** Distância da câmera que segue um jogador (F8b): mais perto que a de TV. */
const DISTANCIA_JOGADOR = 19;

interface Ponto {
  x: number;
  z: number;
}

/**
 * Câmeras do telão (SPEC 7.1).
 * TV: lateral e alta, olhando para -Z (a Casa fica à esquerda), segue a bola com suavização, abre o zoom quando os jogadores
 * se espalham e fecha quando se juntam; todo mundo que importa fica dentro do quadro, inclusive quem está com a bola.
 * Aérea: de cima, o campo inteiro, com a mesma orientação.
 * Replay: atrás do gol, só durante o replay do gol (SPEC 7.1).
 */
export class CameraJogo {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 500);
  modo: ModoCamera = "tv";
  private alvoX = 0;
  private alvoZ = 0;
  private distancia = 45;
  private replayLado: 1 | -1 | null = null;
  private olhaX = 0;
  private olhaZ = 0;

  constructor(private readonly campo: CampoMsg) {
    this.atualizar(1, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, [], true);
  }

  definirAspecto(aspecto: number): void {
    this.camera.aspect = aspecto;
    this.camera.updateProjectionMatrix();
  }

  /** Começa o replay do gol que entrou no lado `lado` (+1 = gol de X positivo): a câmera vai para trás dele. */
  iniciarReplay(lado: 1 | -1): void {
    this.replayLado = lado;
    this.olhaX = lado * (this.campo.comp / 2 - 6);
    this.olhaZ = 0;
    this.camera.up.set(0, 1, 0);
  }

  terminarReplay(): void {
    this.replayLado = null;
    this.definirModo(this.modo);
  }

  get emReplay(): boolean {
    return this.replayLado !== null;
  }

  /** Passa para a próxima câmera: TV, aérea e (se houver quem seguir) a que segue um jogador. */
  alternar(comJogador = false): ModoCamera {
    const ordem: ModoCamera[] = comJogador ? ["tv", "aerea", "jogador"] : ["tv", "aerea"];
    this.definirModo(ordem[(ordem.indexOf(this.modo) + 1) % ordem.length]!);
    return this.modo;
  }

  definirModo(modo: ModoCamera): void {
    this.modo = modo;
    this.camera.up.set(0, modo === "aerea" ? 0 : 1, modo === "aerea" ? -1 : 0);
  }

  private tangentes(): { v: number; h: number } {
    const v = Math.tan((FOV * Math.PI) / 360);
    return { v, h: v * this.camera.aspect };
  }

  /** Distância em que o campo inteiro cabe no quadro. */
  private distanciaDoCampoTodo(): number {
    const { v, h } = this.tangentes();
    return Math.max((this.campo.comp / 2 + 3) / h, ((this.campo.larg / 2 + 3) * Math.sin(INCLINACAO)) / v);
  }

  /** `dt` em segundos. `imediato` pula a suavização (primeiro quadro). */
  atualizar(dt: number, bola: BolaSnap, jogadores: Ponto[], imediato = false, seguir: Ponto | null = null): void {
    if (this.replayLado !== null) {
      // Atrás do gol, um pouco de lado e no alto, seguindo a bola com suavização
      const k = 1 - Math.exp(-dt * 4);
      this.olhaX += (bola.x - this.olhaX) * k;
      this.olhaZ += (bola.z - this.olhaZ) * k;
      // Entre a rede e as placas de publicidade (as arquibancadas de trás começam 6 m depois da linha de fundo)
      this.camera.position.set(this.replayLado * (this.campo.comp / 2 + 4.5), 4.4, 9);
      this.camera.lookAt(this.olhaX, 0.8, this.olhaZ);
      return;
    }

    if (this.modo === "aerea") {
      const { v, h } = this.tangentes();
      const alt = Math.max((this.campo.comp / 2 + 2) / h, (this.campo.larg / 2 + 2) / v);
      this.camera.position.set(0, alt, 0.001);
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (this.modo === "jogador" && seguir) {
      // Segue o jogador de perto, com a bola puxando um pouco a câmera; a orientação é a da TV (não gira junto com o jogador)
      const kJ = imediato ? 1 : 1 - Math.exp(-dt * 4.5);
      // A bola puxa a câmera um pouco para o lado dela (no máximo 5 m), para o jogador nunca sair do quadro
      const dx = bola.x - seguir.x;
      const dz = bola.z - seguir.z;
      const d = Math.hypot(dx, dz) || 1;
      const puxao = Math.min(d * 0.25, 5) / d;
      this.alvoX += (seguir.x + dx * puxao - this.alvoX) * kJ;
      this.alvoZ += (seguir.z + dz * puxao - this.alvoZ) * kJ;
      this.distancia += (DISTANCIA_JOGADOR - this.distancia) * (imediato ? 1 : 1 - Math.exp(-dt * 2));
      this.camera.position.set(this.alvoX, this.distancia * Math.sin(INCLINACAO), this.alvoZ + this.distancia * Math.cos(INCLINACAO));
      this.camera.lookAt(this.alvoX, 0, this.alvoZ);
      return;
    }

    const pontos: Ponto[] = [{ x: bola.x, z: bola.z }, ...jogadores];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pontos) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    // Para onde olhar: a bola pesa mais que o centro do grupo
    const cx = bola.x * 0.6 + ((minX + maxX) / 2) * 0.4;
    const cz = bola.z * 0.6 + ((minZ + maxZ) / 2) * 0.4;

    // Quão longe ficar para caber todo mundo, com folga
    const { v, h } = this.tangentes();
    const dx = ((maxX - minX) / 2 + 7) / h;
    const dz = (((maxZ - minZ) / 2 + 5) * Math.sin(INCLINACAO)) / v;
    const alvoDist = Math.min(this.distanciaDoCampoTodo(), Math.max(DISTANCIA_MIN, dx, dz));

    const kPos = imediato ? 1 : 1 - Math.exp(-dt * 3.5);
    const kZoom = imediato ? 1 : 1 - Math.exp(-dt * 1.6);
    this.alvoX += (cx - this.alvoX) * kPos;
    this.alvoZ += (cz - this.alvoZ) * kPos;
    this.distancia += (alvoDist - this.distancia) * kZoom;

    this.camera.position.set(this.alvoX, this.distancia * Math.sin(INCLINACAO), this.alvoZ + this.distancia * Math.cos(INCLINACAO));
    this.camera.lookAt(this.alvoX, 0, this.alvoZ);
  }
}
