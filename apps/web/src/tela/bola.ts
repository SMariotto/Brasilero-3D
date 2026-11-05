import * as THREE from "three";
import { BOLA, type BolaSnap } from "@b3d/core";

/** A bola desenhada maior que a real (raio 0,11 m) para dar para ler da TV. A física usa o raio de verdade. */
const ESCALA_VISUAL = 2;

function texturaDaBola(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#1a1a1a";
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(10 + i * 22, i % 2 === 0 ? 18 : 46, 7, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface Bola3D {
  grupo: THREE.Group;
  atualizar(b: BolaSnap): void;
}

/** Bola e a sombra dela no chão: a sombra é o que deixa calcular a altura vendo da TV (SPEC 7.2). */
export function criarBola3D(): Bola3D {
  const grupo = new THREE.Group();
  const raio = BOLA.raio * ESCALA_VISUAL;

  const esfera = new THREE.Mesh(new THREE.SphereGeometry(raio, 20, 14), new THREE.MeshStandardMaterial({ map: texturaDaBola(), roughness: 0.6 }));
  esfera.castShadow = true;
  grupo.add(esfera);

  const sombraMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  const sombra = new THREE.Mesh(new THREE.CircleGeometry(raio * 1.1, 20), sombraMat);
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.02;
  grupo.add(sombra);

  return {
    grupo,
    atualizar(b) {
      // O centro da esfera fica na altura real da bola, mas nunca abaixo do raio visual (não afunda no gramado).
      esfera.position.set(b.x, Math.max(b.y, raio), b.z);
      esfera.rotation.z = -b.x * 0.8;
      esfera.rotation.x = b.z * 0.8;
      sombra.position.x = b.x;
      sombra.position.z = b.z;
      const h = Math.max(0, b.y - BOLA.raio);
      sombra.scale.setScalar(1 + h * 0.25);
      sombraMat.opacity = Math.max(0.12, 0.55 / (1 + h * 0.6));
    },
  };
}
