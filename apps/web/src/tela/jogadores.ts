import * as THREE from "three";
import { JOGADOR, SEM_DOMINANTE, type JogadorSnap, type VagaElenco } from "@b3d/core";

/** Etiqueta com o apelido, desenhada num canvas e usada como sprite (sempre virada para a câmera). */
function etiqueta(nome: string, cor: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;
  const g = canvas.getContext("2d")!;
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 10;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(nome, 160, 42);
  g.fillStyle = "#ffffff";
  g.fillText(nome, 160, 42);
  g.fillStyle = cor;
  g.fillRect(40, 70, 240, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(3.6, 0.9, 1);
  s.renderOrder = 10;
  return s;
}

interface Figura {
  grupo: THREE.Group;
  corpo: THREE.Mesh;
  /** Apelido em cima do jogador (só humanos). Fica fora do grupo para não girar com o corpo. */
  rotulo: THREE.Sprite | null;
}

/**
 * Os jogadores como cápsulas na cor do time (F2 a F5; o modelo animado entra na F6), com apelido e seta em cima dos humanos
 * e um anel no chão sob quem está com a bola.
 */
export class Jogadores {
  readonly grupo = new THREE.Group();
  private readonly figuras = new Map<number, Figura>();
  private readonly anel: THREE.Mesh;

  constructor(elenco: VagaElenco[], cores: [string, string]) {
    const alturaTronco = JOGADOR.alturaCorpo - JOGADOR.raio * 2;

    for (const v of elenco) {
      const cor = cores[v.time];
      const grupo = new THREE.Group();

      const corpo = new THREE.Mesh(
        new THREE.CapsuleGeometry(JOGADOR.raio, alturaTronco, 4, 14),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), roughness: 0.7 }),
      );
      corpo.position.y = JOGADOR.alturaCorpo / 2;
      grupo.add(corpo);

      // "Nariz": mostra para onde o corpo olha
      const nariz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      nariz.position.set(JOGADOR.raio, JOGADOR.alturaCorpo * 0.72, 0);
      grupo.add(nariz);

      let rotulo: THREE.Sprite | null = null;
      if (v.humano) {
        const seta = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(cor) }));
        seta.rotation.x = Math.PI; // ponta para baixo
        seta.position.y = JOGADOR.alturaCorpo + 0.55;
        seta.name = "seta";
        grupo.add(seta);
        rotulo = etiqueta(v.nome, cor);
        this.grupo.add(rotulo);
      }

      this.grupo.add(grupo);
      this.figuras.set(v.slot, { grupo, corpo, rotulo });
    }

    this.anel = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.anel.rotation.x = -Math.PI / 2;
    this.anel.position.y = 0.04;
    this.anel.visible = false;
    this.grupo.add(this.anel);
  }

  atualizar(jogadores: Array<Omit<JogadorSnap, "dir"> & { dir: number }>, dominante: number): void {
    this.anel.visible = false;
    for (const j of jogadores) {
      const f = this.figuras.get(j.slot);
      if (!f) continue;
      f.grupo.position.set(j.x, 0, j.z);
      f.grupo.rotation.y = -j.dir; // dirX = cos, dirZ = sin: girar +X para +Z é no sentido horário visto de cima
      // Inclina um pouco para a frente conforme a velocidade (corrida) e "afunda" na arrancada
      f.corpo.rotation.z = -Math.min(0.28, j.vel * 0.04);
      f.corpo.scale.y = j.arrancando ? 0.94 : 1;

      f.rotulo?.position.set(j.x, JOGADOR.alturaCorpo + 1.35, j.z);

      if (j.slot === dominante && dominante !== SEM_DOMINANTE) {
        this.anel.visible = true;
        this.anel.position.x = j.x;
        this.anel.position.z = j.z;
        this.anel.scale.setScalar(1 + j.carga * 0.6);
        (this.anel.material as THREE.MeshBasicMaterial).color.set(j.carga > 0.02 ? 0xff7043 : 0xffd54a);
      }
    }
  }
}
