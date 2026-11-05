import * as THREE from "three";
import type { BolaSnap, CampoMsg } from "@b3d/core";

export type ModoCamera = "tv" | "aerea";

const FOV = 35;
/** Inclinação da câmera de TV, em radianos acima do campo (como a transmissão). */
const INCLINACAO = (38 * Math.PI) / 180;
const DISTANCIA_MIN = 22;

interface Ponto {
  x: number;
  z: number;
}

/**
 * Câmeras do telão (SPEC 7.1).
 * TV: lateral e alta, olhando para -Z (a Casa fica à esquerda), segue a bola com suavização, abre o zoom quando os jogadores
 * se espalham e fecha quando se juntam; todo mundo que importa fica dentro do quadro, inclusive quem está com a bola.
 * Aérea: de cima, o campo inteiro, com a mesma orientação.
 */
export class CameraJogo {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 500);
  modo: ModoCamera = "tv";
  private alvoX = 0;
  private alvoZ = 0;
  private distancia = 45;

  constructor(private readonly campo: CampoMsg) {
    this.atualizar(1, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, [], true);
  }

  definirAspecto(aspecto: number): void {
    this.camera.aspect = aspecto;
    this.camera.updateProjectionMatrix();
  }

  alternar(): ModoCamera {
    this.modo = this.modo === "tv" ? "aerea" : "tv";
    this.camera.up.set(0, this.modo === "aerea" ? 0 : 1, this.modo === "aerea" ? -1 : 0);
    return this.modo;
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
  atualizar(dt: number, bola: BolaSnap, jogadores: Ponto[], imediato = false): void {
    if (this.modo === "aerea") {
      const { v, h } = this.tangentes();
      const alt = Math.max((this.campo.comp / 2 + 2) / h, (this.campo.larg / 2 + 2) / v);
      this.camera.position.set(0, alt, 0.001);
      this.camera.lookAt(0, 0, 0);
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
