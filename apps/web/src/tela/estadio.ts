import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CampoMsg } from "@b3d/core";

// Estádio (SPEC 7.3, ARQUITETURA 6.4): arquibancadas em blocos simples, torcida como InstancedMesh de planos (billboards) com
// silhuetas desenhadas por código e cor por instância nas cores dos dois clubes, refletores, placas e céu de noite.

const DEGRAUS = 7;
const ALTURA_DEGRAU = 0.8;
const PROFUNDIDADE_DEGRAU = 1.0;
const ESPACO_TORCEDOR = 0.9;

/** Silhueta de torcedor em branco sobre fundo transparente; a cor do time entra pela cor da instância. */
function silhueta(variacao: 0 | 1 | 2): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  // Corpo e ombros
  g.beginPath();
  g.moveTo(8, 96);
  g.quadraticCurveTo(8, 52, 32, 50);
  g.quadraticCurveTo(56, 52, 56, 96);
  g.closePath();
  g.fill();
  // Cabeça
  g.beginPath();
  g.arc(32, 32, 14, 0, Math.PI * 2);
  g.fill();
  if (variacao === 1) {
    // Braços para o alto (comemorando)
    g.lineWidth = 9;
    g.lineCap = "round";
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.moveTo(14, 62);
    g.lineTo(6, 24);
    g.moveTo(50, 62);
    g.lineTo(58, 24);
    g.stroke();
  } else if (variacao === 2) {
    // Cachecol esticado (bandeira) de um lado
    g.fillRect(6, 4, 22, 14);
    g.fillRect(14, 4, 5, 48);
  }
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function texturaDasPlacas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0b2f6b";
  g.fillRect(0, 0, 1024, 64);
  g.font = "bold 40px system-ui, sans-serif";
  g.textBaseline = "middle";
  g.fillStyle = "#ffd54a";
  for (let x = 20; x < 1024; x += 340) g.fillText("BRASILERO 3D", x, 34);
  g.fillStyle = "#ffffff";
  for (let x = 250; x < 1024; x += 340) g.fillText("★", x, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Fundo de céu noturno: degradê do azul-marinho ao quase preto, com estrelas pequenas. */
function ceuNoturno(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#02040b");
  grad.addColorStop(0.55, "#0a1630");
  grad.addColorStop(1, "#1a2f55");
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Lugar {
  x: number;
  y: number;
  z: number;
  /** Para onde o torcedor "olha" (direção da arquibancada), só para escolher o lado da cor. */
  lado: "casa" | "visitante" | "misto";
}

/** Os lugares (um por torcedor) nas arquibancadas das laterais e atrás dos dois gols. */
function lugares(c: CampoMsg): Lugar[] {
  const todos: Lugar[] = [];
  const largura = c.larg + 8;
  const comprimento = c.comp + 10;

  // Laterais (Z positivo e negativo): ao longo do comprimento do campo
  for (const sz of [-1, 1] as const) {
    for (let d = 0; d < DEGRAUS; d++) {
      const z = sz * (c.larg / 2 + 4 + d * PROFUNDIDADE_DEGRAU + PROFUNDIDADE_DEGRAU / 2);
      const y = (d + 1) * ALTURA_DEGRAU + 0.55;
      for (let x = -comprimento / 2 + 0.5; x <= comprimento / 2 - 0.5; x += ESPACO_TORCEDOR) todos.push({ x, y, z, lado: "misto" });
    }
  }
  // Atrás dos gols: a torcida do time da casa atrás do gol da Casa (X negativo) e a do visitante do outro lado
  for (const sx of [-1, 1] as const) {
    for (let d = 0; d < DEGRAUS; d++) {
      const x = sx * (c.comp / 2 + 6 + d * PROFUNDIDADE_DEGRAU + PROFUNDIDADE_DEGRAU / 2);
      const y = (d + 1) * ALTURA_DEGRAU + 0.55;
      for (let z = -largura / 2 + 0.5; z <= largura / 2 - 0.5; z += ESPACO_TORCEDOR) todos.push({ x, y, z, lado: sx === -1 ? "casa" : "visitante" });
    }
  }
  return todos;
}

export interface Torcida {
  malhas: THREE.InstancedMesh[];
  /** Os torcedores pulam por `segundos` (gol). */
  pular(segundos: number): void;
  atualizar(dtS: number): void;
  definirVisivel(sim: boolean): void;
}

function criarTorcida(c: CampoMsg, cores: [string, string]): Torcida {
  const pontos = lugares(c);
  const variacoes: (0 | 1 | 2)[] = [0, 1, 2];
  const grupos: Lugar[][] = [[], [], []];
  let sorteio = 12345;
  const rnd = (): number => {
    sorteio = (sorteio * 1664525 + 1013904223) >>> 0;
    return sorteio / 4294967296;
  };
  for (const p of pontos) grupos[Math.floor(rnd() * 3)]!.push(p);

  const corCasa = new THREE.Color(cores[0]);
  const corVisitante = new THREE.Color(cores[1]);
  const neutra = new THREE.Color(0x9aa3b5);
  const matriz = new THREE.Matrix4();
  const cor = new THREE.Color();

  const malhas: THREE.InstancedMesh[] = [];
  const estados: { lugares: Lugar[]; fase: Float32Array }[] = [];

  variacoes.forEach((v, i) => {
    const lista = grupos[i]!;
    const geo = new THREE.PlaneGeometry(0.85, 1.28);
    const mat = new THREE.MeshBasicMaterial({ map: silhueta(v), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const malha = new THREE.InstancedMesh(geo, mat, lista.length);
    malha.frustumCulled = false;
    const fase = new Float32Array(lista.length);

    lista.forEach((p, k) => {
      matriz.makeTranslation(p.x, p.y, p.z);
      malha.setMatrixAt(k, matriz);
      // Cor por instância: a torcida de cada lado nas cores do clube (80%), o resto neutro; laterais misturadas
      const r = rnd();
      let base: THREE.Color;
      if (p.lado === "casa") base = r < 0.8 ? corCasa : r < 0.9 ? corVisitante : neutra;
      else if (p.lado === "visitante") base = r < 0.8 ? corVisitante : r < 0.9 ? corCasa : neutra;
      else base = r < 0.42 ? corCasa : r < 0.84 ? corVisitante : neutra;
      // Um pouco mais escuro que a camisa (é noite) e com variação para não parecer carimbo
      cor.copy(base).multiplyScalar(0.55 + 0.3 * rnd());
      malha.setColorAt(k, cor);
      fase[k] = rnd() * Math.PI * 2;
    });
    malha.instanceMatrix.needsUpdate = true;
    if (malha.instanceColor) malha.instanceColor.needsUpdate = true;
    malhas.push(malha);
    estados.push({ lugares: lista, fase });
  });

  let pulo = 0;
  let relogio = 0;

  const aplicarAltura = (alturaExtra: (fase: number) => number): void => {
    malhas.forEach((malha, i) => {
      const e = estados[i]!;
      for (let k = 0; k < e.lugares.length; k++) {
        const p = e.lugares[k]!;
        matriz.makeTranslation(p.x, p.y + alturaExtra(e.fase[k]!), p.z);
        malha.setMatrixAt(k, matriz);
      }
      malha.instanceMatrix.needsUpdate = true;
    });
  };

  return {
    malhas,
    pular(segundos) {
      pulo = Math.max(pulo, segundos);
    },
    atualizar(dtS) {
      relogio += dtS;
      if (pulo > 0) {
        pulo -= dtS;
        const amp = Math.min(1, pulo) * 0.45;
        aplicarAltura((fase) => Math.abs(Math.sin(relogio * 9 + fase)) * amp);
        if (pulo <= 0) aplicarAltura(() => 0);
      }
    },
    definirVisivel(sim) {
      for (const m of malhas) m.visible = sim;
    },
  };
}

/** Arquibancadas: degraus em blocos, um bloco por lado, todos juntos num único desenho. */
function criarArquibancadas(c: CampoMsg): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const comprimento = c.comp + 10;
  const largura = c.larg + 8;
  for (let d = 0; d < DEGRAUS; d++) {
    const alt = (d + 1) * ALTURA_DEGRAU;
    for (const sz of [-1, 1] as const) {
      const g = new THREE.BoxGeometry(comprimento, alt, PROFUNDIDADE_DEGRAU);
      g.translate(0, alt / 2, sz * (c.larg / 2 + 4 + d * PROFUNDIDADE_DEGRAU + PROFUNDIDADE_DEGRAU / 2));
      geos.push(g);
    }
    for (const sx of [-1, 1] as const) {
      const g = new THREE.BoxGeometry(PROFUNDIDADE_DEGRAU, alt, largura);
      g.translate(sx * (c.comp / 2 + 6 + d * PROFUNDIDADE_DEGRAU + PROFUNDIDADE_DEGRAU / 2), alt / 2, 0);
      geos.push(g);
    }
  }
  const malha = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshLambertMaterial({ color: 0x3a4357 }));
  malha.receiveShadow = true;
  for (const g of geos) g.dispose();
  return malha;
}

/** Refletores nos quatro cantos: a torre é um cilindro e o painel de luz brilha (o bloom faz o halo). */
function criarRefletores(c: CampoMsg): THREE.Group {
  const grupo = new THREE.Group();
  const poste = new THREE.MeshLambertMaterial({ color: 0x59616f });
  const luz = new THREE.MeshBasicMaterial({ color: 0xfff7d6 });
  const alturaTorre = 24;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const x = sx * (c.comp / 2 + 11);
      const z = sz * (c.larg / 2 + 11);
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, alturaTorre, 8), poste);
      torre.position.set(x, alturaTorre / 2, z);
      const painel = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.4), luz);
      painel.position.set(x, alturaTorre + 1, z);
      // Virado para o centro do campo
      painel.lookAt(0, 6, 0);
      grupo.add(torre, painel);
    }
  }
  return grupo;
}

/** Placas de publicidade em volta do campo (só com o nome do jogo). */
function criarPlacas(c: CampoMsg): THREE.Group {
  const grupo = new THREE.Group();
  const textura = texturaDasPlacas();
  const mat = (repeticoes: number): THREE.MeshLambertMaterial => {
    const t = textura.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(repeticoes, 1);
    return new THREE.MeshLambertMaterial({ map: t });
  };
  for (const sz of [-1, 1] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(c.comp + 6, 0.9, 0.25), mat((c.comp + 6) / 24));
    p.position.set(0, 0.45, sz * (c.larg / 2 + 3));
    grupo.add(p);
  }
  for (const sx of [-1, 1] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, c.larg + 6), mat((c.larg + 6) / 24));
    p.position.set(sx * (c.comp / 2 + 5), 0.45, 0);
    grupo.add(p);
  }
  return grupo;
}

/** Estrelas: pontos espalhados numa cúpula bem acima do estádio. */
function criarEstrelas(): THREE.Points {
  const n = 260;
  const pos = new Float32Array(n * 3);
  let s = 777;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2;
    const elev = 0.25 + rnd() * 0.7;
    const r = 300;
    pos[i * 3] = Math.cos(ang) * Math.cos(elev) * r;
    pos[i * 3 + 1] = Math.sin(elev) * r;
    pos[i * 3 + 2] = Math.sin(ang) * Math.cos(elev) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfeaff, size: 1.6, sizeAttenuation: false, fog: false }));
}

export interface Estadio {
  grupo: THREE.Group;
  torcida: Torcida;
  /** Fundo da cena (céu de noite). */
  ceu: THREE.Texture;
}

/** Tudo que fica em volta do campo: arquibancadas, torcida, refletores, placas e estrelas. */
export function criarEstadio(c: CampoMsg, cores: [string, string]): Estadio {
  const grupo = new THREE.Group();
  grupo.add(criarArquibancadas(c), criarRefletores(c), criarPlacas(c), criarEstrelas());
  const torcida = criarTorcida(c, cores);
  for (const m of torcida.malhas) grupo.add(m);
  return { grupo, torcida, ceu: ceuNoturno() };
}
