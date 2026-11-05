import * as THREE from "three";
import type { CampoMsg } from "@b3d/core";

const PX_POR_METRO = 16;

/** Gramado com faixas de corte e as linhas brancas, desenhado num canvas (um pixel de textura por ~6 cm). */
function texturaDoGramado(c: CampoMsg): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(c.comp * PX_POR_METRO);
  canvas.height = Math.round(c.larg * PX_POR_METRO);
  const g = canvas.getContext("2d")!;
  const px = (m: number): number => m * PX_POR_METRO;

  // Faixas de 5 m
  const faixa = 5;
  for (let i = 0; i * faixa < c.comp; i++) {
    g.fillStyle = i % 2 === 0 ? "#2f8f3f" : "#287f37";
    g.fillRect(px(i * faixa), 0, px(faixa), canvas.height);
  }

  g.strokeStyle = "#ffffff";
  g.fillStyle = "#ffffff";
  g.lineWidth = 3;
  const cx = (x: number): number => px(x + c.comp / 2);
  const cz = (z: number): number => px(z + c.larg / 2);

  g.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  g.beginPath();
  g.moveTo(cx(0), 0);
  g.lineTo(cx(0), canvas.height);
  g.stroke();
  g.beginPath();
  g.arc(cx(0), cz(0), px(Math.min(c.larg * 0.12, 5)), 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(cx(0), cz(0), 4, 0, Math.PI * 2);
  g.fill();

  // Áreas do goleiro (profundidade em X, largura em Z)
  for (const lado of [-1, 1]) {
    const xFundo = lado * (c.comp / 2);
    const xFrente = xFundo - lado * c.areaComp;
    g.strokeRect(Math.min(cx(xFundo), cx(xFrente)), cz(-c.areaLarg / 2), Math.abs(cx(xFundo) - cx(xFrente)), px(c.areaLarg));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Malha fina e translúcida da rede do gol. */
function texturaDaRede(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function gol(c: CampoMsg, lado: 1 | -1, metal: THREE.Material, rede: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const x = lado * (c.comp / 2);
  const meia = c.golLarg / 2;
  const prof = 2;
  const R = 0.08;

  for (const z of [-meia, meia]) {
    const trave = new THREE.Mesh(new THREE.CylinderGeometry(R, R, c.golAlt, 12), metal);
    trave.position.set(x, c.golAlt / 2, z);
    g.add(trave);
  }
  const travessao = new THREE.Mesh(new THREE.CylinderGeometry(R, R, c.golLarg + R * 2, 12), metal);
  travessao.rotation.x = Math.PI / 2;
  travessao.position.set(x, c.golAlt, 0);
  g.add(travessao);

  const malha = (largura: number, altura: number): THREE.Mesh => {
    const t = rede.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(largura / 0.3)), Math.max(1, Math.round(altura / 0.3)));
    return new THREE.Mesh(
      new THREE.PlaneGeometry(largura, altura),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
  };
  const fundo = malha(c.golLarg, c.golAlt);
  fundo.position.set(x + lado * prof, c.golAlt / 2, 0);
  fundo.rotation.y = Math.PI / 2;
  g.add(fundo);
  for (const z of [-meia, meia]) {
    const lateral = malha(prof, c.golAlt);
    lateral.position.set(x + (lado * prof) / 2, c.golAlt / 2, z);
    g.add(lateral);
  }
  const teto = malha(prof, c.golLarg);
  teto.rotation.x = Math.PI / 2;
  teto.rotation.z = Math.PI / 2;
  teto.position.set(x + (lado * prof) / 2, c.golAlt, 0);
  g.add(teto);
  return g;
}

/** Tudo que é parado: gramado, linhas, gols com rede e, no modo Arena, as paredes de 1 m. */
export function criarCampo3D(c: CampoMsg): THREE.Group {
  const grupo = new THREE.Group();

  const chao = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x1c5a2a }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.03;
  grupo.add(chao);

  const gramado = new THREE.Mesh(new THREE.PlaneGeometry(c.comp, c.larg), new THREE.MeshLambertMaterial({ map: texturaDoGramado(c) }));
  gramado.rotation.x = -Math.PI / 2;
  grupo.add(gramado);

  const metal = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.6, roughness: 0.35 });
  const rede = texturaDaRede();
  grupo.add(gol(c, -1, metal, rede), gol(c, 1, metal, rede));

  if (c.paredes) {
    const parede = new THREE.MeshStandardMaterial({ color: 0x2563eb, transparent: true, opacity: 0.55, roughness: 0.5 });
    const alt = 1;
    const esp = 0.3;
    const lateral = (z: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.comp + esp * 2, alt, esp), parede);
      m.position.set(0, alt / 2, z);
      return m;
    };
    grupo.add(lateral(-(c.larg / 2 + esp / 2)), lateral(c.larg / 2 + esp / 2));
    // Linha de fundo: dois pedaços, deixando a boca do gol aberta
    const pedaco = (c.larg - c.golLarg) / 2;
    for (const lado of [-1, 1]) {
      for (const sinal of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(esp, alt, pedaco), parede);
        m.position.set(lado * (c.comp / 2 + esp / 2), alt / 2, sinal * (c.golLarg / 2 + pedaco / 2));
        grupo.add(m);
      }
    }
  }
  return grupo;
}
