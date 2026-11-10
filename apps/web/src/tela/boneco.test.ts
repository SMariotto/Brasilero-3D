import { readFileSync } from "node:fs";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { ANIM, JOGADOR } from "@b3d/core";
import { CLIPE, CONTATO_DO_CHUTE_S, TODOS_OS_CLIPES, VELOCIDADE_DA_CORRIDA_GRAVADA } from "./animacoes-boneco";
import { NOME_DO_CORPO, TODAS_AS_CHAVES_DE_CABELO } from "./boneco-dados";
import { FiguraBoneco, ehGlb, imagemDoGlb, lerCabelo, lerCorpo, semTexturas, type BonecoBase } from "./boneco";

// Estes testes abrem os arquivos de verdade de public/boneco (o corpo do rig e os 35 cabelos), sem navegador: as imagens ficam de fora
// (é o que `semTexturas` faz no jogo também), então a skin e o atlas dos rostos não entram aqui.

const PASTA = new URL("../../public/boneco/", import.meta.url);
const bytesDe = (rel: string): ArrayBuffer => {
  const b = readFileSync(new URL(rel, PASTA));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

let base: BonecoBase;
beforeAll(async () => {
  base = await lerCorpo(bytesDe(NOME_DO_CORPO));
});

const ossoDe = (raiz: THREE.Object3D, nome: string): THREE.Object3D => raiz.getObjectByName(nome)!;
const malhas = (raiz: THREE.Object3D): THREE.SkinnedMesh[] => {
  const l: THREE.SkinnedMesh[] = [];
  raiz.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && l.push(o as THREE.SkinnedMesh));
  return l;
};

/** Toca o clipe `nome` quadro a quadro (30 fps) no corpo original e devolve a posição de cada osso pedido, no espaço do rig. */
function amostrar(nome: string, ossos: string[]): Array<Record<string, THREE.Vector3>> {
  const cena = base.cena;
  const mixer = new THREE.AnimationMixer(cena);
  const clipe = base.clipes.find((c) => c.name === nome)!;
  mixer.clipAction(clipe).play();
  const n = Math.round(clipe.duration * 30);
  const saida: Array<Record<string, THREE.Vector3>> = [];
  for (let i = 0; i <= n; i++) {
    mixer.setTime(i / 30);
    cena.updateMatrixWorld(true);
    saida.push(Object.fromEntries(ossos.map((o) => [o, ossoDe(cena, o).getWorldPosition(new THREE.Vector3())])));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(cena);
  return saida;
}

describe("o corpo (model-brasilero-3d-rig-1malha.glb)", () => {
  it("é um GLB, e as imagens embutidas saem sem o GLTFLoader precisar abrir nenhuma", () => {
    const bytes = bytesDe(NOME_DO_CORPO);
    expect(ehGlb(bytes)).toBe(true);
    expect(ehGlb(new TextEncoder().encode("<!doctype html>").buffer as ArrayBuffer)).toBe(false);
    const limpo = semTexturas(bytes);
    expect(new DataView(limpo).getUint32(8, true)).toBe(limpo.byteLength);
    expect(new TextDecoder().decode(new Uint8Array(limpo, 20, 400))).not.toContain('"images"');
    // A imagem embutida (a skin) continua dá para extrair do original
    const im = imagemDoGlb(bytes)!;
    expect(im.mime).toBe("image/png");
    expect(Buffer.from(im.b64, "base64").subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  it("tem o esqueleto de 17 ossos e os 9 clipes com os nomes exatos", () => {
    expect(base.ossos).toHaveLength(17);
    for (const o of ["Raiz", "Quadril", "Peito", "Pescoco", "Cabeca", "BracoL", "BracoR", "PeL", "PeR"]) expect(base.ossos, o).toContain(o);
    expect(new Set(base.clipes.map((c) => c.name))).toEqual(new Set(TODOS_OS_CLIPES));
    expect(base.clipes).toHaveLength(9);
  });

  it("o corpo vem em uma malha só, mais o rosto (o glb de malha única)", () => {
    const pecas = malhas(base.cena);
    expect(pecas.map((m) => m.name).sort()).toEqual(["Corpo", "Rosto_Expressao"]);
    expect(pecas.filter((m) => m.name !== "Rosto_Expressao")).toHaveLength(1);
  });

  it("acha o material Skin, o Rosto e a malha do rosto; as imagens ficam para o navegador", () => {
    expect(base.materialSkin?.name).toBe("Skin");
    expect(base.materialRosto?.name).toBe("Rosto");
    expect((base.materialSkin as THREE.MeshStandardMaterial).map).toBeNull();
    expect(malhas(base.cena).filter((m) => m.name === "Rosto_Expressao")).toHaveLength(1);
  });

  it("é ampliado de 0,44 m para a altura do jogador", () => {
    expect(base.escala).toBeGreaterThan(3.9);
    expect(base.escala).toBeLessThan(4.3);
    expect(0.44 * base.escala).toBeCloseTo(JOGADOR.alturaCorpo, 1);
  });
});

describe("FiguraBoneco", () => {
  const SKIN = new THREE.MeshStandardMaterial({ name: "Skin-do-time" });

  it("fica em pé, com 1,8 m e os pés no chão, de frente para +X", () => {
    const f = new FiguraBoneco(base, SKIN, null, 0, false);
    f.raiz.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(f.raiz);
    expect(caixa.min.y).toBeCloseTo(0, 1);
    expect(caixa.max.y).toBeCloseTo(JOGADOR.alturaCorpo, 1);
    // De frente para +X: o nariz (Cranio) fica mais para +X que o pescoço, e a frente do boneco olha para +X
    const frente = new THREE.Vector3(0, 0, 1).transformDirection(f.raiz.matrixWorld);
    expect(frente.x).toBeCloseTo(1, 5);
    expect(frente.z).toBeCloseTo(0, 5);
  });

  it("cada jogador tem esqueleto próprio, mas todos dividem a skin do time", () => {
    const a = new FiguraBoneco(base, SKIN, null, 0, false);
    const b = new FiguraBoneco(base, SKIN, null, 1, false);
    expect(a.raiz).not.toBe(b.raiz);
    expect(ossoDe(a.raiz, "PeL")).not.toBe(ossoDe(b.raiz, "PeL"));
    expect(base.cena.parent).toBeNull(); // o original nunca entra na cena
    const corpoA = malhas(a.raiz).filter((m) => m.name !== "Rosto_Expressao");
    expect(corpoA.length).toBeGreaterThan(0);
    for (const m of [...corpoA, ...malhas(b.raiz).filter((x) => x.name !== "Rosto_Expressao")]) expect(m.material).toBe(SKIN);
    expect(malhas(a.raiz)[0]!.skeleton).not.toBe(malhas(b.raiz)[0]!.skeleton);
  });

  it("todas as peças de um jogador (corpo, rosto e cabelo) dividem um esqueleto só: uma textura de ossos e uma atualização por quadro", () => {
    const f = new FiguraBoneco(base, SKIN, null, 0, false);
    const pecas = malhas(f.raiz);
    expect(pecas).toHaveLength(2);
    expect(new Set(pecas.map((m) => m.skeleton)).size).toBe(1);
    // ...e os ossos desse esqueleto são os do clone (não os do corpo original)
    for (const o of pecas[0]!.skeleton.bones) expect(base.cena.getObjectByName(o.name)).not.toBe(o);
    expect(pecas[0]!.skeleton.bones[0]!.parent).not.toBeNull();
  });

  it("sem o atlas dos rostos o rosto é escondido (senão apareceria uma máscara lisa)", () => {
    const f = new FiguraBoneco(base, SKIN, null, 0, false);
    expect(malhas(f.raiz).find((m) => m.name === "Rosto_Expressao")!.visible).toBe(false);
  });

  it("troca de clipe pelo estado do snapshot e volta ao repouso quando o clipe de uma jogada acaba", () => {
    const f = new FiguraBoneco(base, SKIN, null, 0, false);
    const e = { anim: ANIM.parado, vel: 0, x: 0, z: 0, dir: 0 };
    const passo = (anim: number, seg: number, bola?: { x: number; y: number; z: number }, vel = 0): void => {
      for (let t = 0; t < seg; t += 1 / 60) f.atualizar({ ...e, anim, vel }, 1 / 60, bola);
    };
    passo(ANIM.parado, 0.2);
    expect(f.clipeAtual).toBe(CLIPE.parado);
    passo(ANIM.corrida, 0.2, undefined, 6);
    expect(f.clipeAtual).toBe(CLIPE.correr);
    passo(ANIM.chute, 0.05, { x: 0.5, y: 0, z: -0.4 });
    expect(f.clipeAtual).toBe(CLIPE.chutarEsq);
    passo(ANIM.chute, 0.5, { x: 0.5, y: 0, z: -0.4 }); // o clipe (acelerado) acaba antes do estado de 0,3 s... e volta a parado
    expect(f.clipeAtual).toBe(CLIPE.parado);
    passo(ANIM.parado, 0.1);
    passo(ANIM.chute, 0.05, { x: 0.5, y: 0, z: 0.4 });
    expect(f.clipeAtual).toBe(CLIPE.chutar);
    passo(ANIM.comemoracao, 0.1);
    expect(f.clipeAtual).toBe(CLIPE.comemorar);
    passo(ANIM.comemoracao, 1.5); // comemorar dura 1,2 s: com o estado ainda valendo, volta a parado
    expect(f.clipeAtual).toBe(CLIPE.parado);
  });

  it("o goleiro usa os clipes de goleiro", () => {
    const f = new FiguraBoneco(base, SKIN, null, 0, true);
    const e = { anim: ANIM.goleiroParado, vel: 0, x: 0, z: 0, dir: 0 };
    f.atualizar(e, 1 / 60);
    expect(f.clipeAtual).toBe(CLIPE.gkParado);
    f.atualizar({ ...e, anim: ANIM.goleiroMergulhoDir }, 1 / 60, { x: 3, y: 0.4, z: 2 });
    expect(f.clipeAtual).toBe(CLIPE.gkMergulhoDir);
    f.atualizar({ ...e, anim: ANIM.goleiroMergulhoEsq }, 1 / 60, { x: 3, y: 2.0, z: -2 });
    expect(f.clipeAtual).toBe(CLIPE.gkDefesaAlta);
    f.atualizar({ ...e, anim: ANIM.goleiroComBola }, 1 / 60);
    expect(f.clipeAtual).toBe(CLIPE.gkParado);
  });

  it("a animação mexe o corpo de verdade (a perna anda na corrida) e a corrida mais rápida toca mais rápido", () => {
    const f = new FiguraBoneco(base, SKIN, null, 0, false);
    const pe = ossoDe(f.raiz, "PeL");
    const zs: number[] = [];
    for (let i = 0; i < 40; i++) {
      f.atualizar({ anim: ANIM.corrida, vel: 5, x: 0, z: 0, dir: 0 }, 1 / 60);
      f.raiz.updateMatrixWorld(true);
      zs.push(pe.getWorldPosition(new THREE.Vector3()).x); // de frente para +X
    }
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.2);
  });

  it("os 12 jogadores de uma partida: 12 cópias, 12 mixers e nenhuma quebra ao liberar", () => {
    const fs = Array.from({ length: 12 }, (_, i) => new FiguraBoneco(base, SKIN, null, i % 5, i % 6 === 0, i));
    for (const f of fs) f.atualizar({ anim: ANIM.corrida, vel: 4, x: 0, z: 0, dir: 0 }, 1 / 60);
    for (const f of fs) f.liberar();
  });
});

describe("as animações têm o que o jogo supõe", () => {
  it("chutar é com o pé direito e chutar_esq com o esquerdo, e o pé bate na bola no quadro 16", () => {
    for (const [clipe, forte, fraco] of [
      ["chutar", "PeR", "PeL"],
      ["chutar_esq", "PeL", "PeR"],
    ] as const) {
      const a = amostrar(clipe, ["PeL", "PeR"]);
      const alcance = (osso: string): number => Math.max(...a.map((q) => q[osso]!.z)) - Math.min(...a.map((q) => q[osso]!.z));
      expect(alcance(forte), clipe).toBeGreaterThan(alcance(fraco) * 2);
      const zs = a.map((q) => q[forte]!.z);
      expect(Math.abs(zs.indexOf(Math.max(...zs)) - CONTATO_DO_CHUTE_S * 30), clipe).toBeLessThanOrEqual(1);
    }
  });

  it("o mergulho 'esq' vai para +X do boneco (a esquerda dele) e o 'dir' para -X", () => {
    const x = (clipe: string): number => {
      const q = amostrar(clipe, ["Quadril"]).map((f) => f["Quadril"]!.x);
      return q.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
    };
    expect(x("gk_mergulho_esq")).toBeGreaterThan(0.15);
    expect(x("gk_mergulho_dir")).toBeLessThan(-0.15);
  });

  it("calibragem da corrida: o pé de apoio anda para trás à velocidade VELOCIDADE_DA_CORRIDA_GRAVADA (m/s do jogo) a 1x", () => {
    const a = amostrar("correr", ["PeL", "Quadril"]);
    const rel = a.map((q) => q["PeL"]!.z - q["Quadril"]!.z);
    const v = [];
    for (let i = 1; i < rel.length; i++) v.push((rel[i]! - rel[i - 1]!) * 30);
    // O pé de apoio é a fase em que ele anda para trás de modo parelho: a mediana das velocidades negativas
    const neg = v.filter((x) => x < 0).sort((p, q) => p - q);
    const mediana = neg[Math.floor(neg.length / 2)]!;
    const doJogo = Math.abs(mediana) * base.escala;
    expect(Math.abs(doJogo - VELOCIDADE_DA_CORRIDA_GRAVADA) / VELOCIDADE_DA_CORRIDA_GRAVADA).toBeLessThan(0.08);
  });
});

describe("cabelos", () => {
  it("os 35 cabelos abrem, trazem a imagem e ligam todos os ossos ao esqueleto do corpo", async () => {
    for (const chave of TODAS_AS_CHAVES_DE_CABELO) {
      const c = await lerCabelo(bytesDe(`cabelos/${chave}.glb`), base.ossos);
      expect(c.imagem, chave).not.toBeNull();
      const idx = c.geometria.getAttribute("skinIndex");
      expect(idx.count, chave).toBeGreaterThan(100);
      for (let i = 0; i < idx.count; i++) for (const k of [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)]) expect(k < base.ossos.length && k >= 0, `${chave} vértice ${i}`).toBe(true);
    }
  }, 60_000);

  it("recusa um cabelo cujos ossos o corpo não tem", async () => {
    await expect(lerCabelo(bytesDe("cabelos/07-mullet_preto.glb"), ["Raiz", "Quadril"])).rejects.toThrow(/ossos do cabelo/);
  });

  it("o cabelo fica preso à cabeça do jogador: acompanha o osso e fica no alto do boneco", async () => {
    const c = await lerCabelo(bytesDe("cabelos/07-mullet_preto.glb"), base.ossos);
    const f = new FiguraBoneco(base, null, { geometria: c.geometria, material: c.material }, 0, false);
    const todas = malhas(f.raiz);
    const cabelo = todas[todas.length - 1]!;
    expect(todas).toHaveLength(3); // o corpo, o rosto e o cabelo
    expect(cabelo.skeleton).toBe(todas[0]!.skeleton);

    f.raiz.updateMatrixWorld(true);
    const parado = new THREE.Box3().setFromObject(cabelo);
    expect(parado.min.y).toBeGreaterThan(1.1); // na cabeça (1,8 m de boneco)
    expect(parado.max.y).toBeLessThan(2.1);

    // Com o boneco correndo, a cabeça balança e o cabelo vai junto: a distância dele à cabeça não muda
    const cabeca = ossoDe(f.raiz, "Cabeca");
    const distancias: number[] = [];
    for (let i = 0; i < 20; i++) {
      f.atualizar({ anim: ANIM.corrida, vel: 6, x: 0, z: 0, dir: 0 }, 1 / 30);
      f.raiz.updateMatrixWorld(true);
      cabelo.computeBoundingBox();
      const centro = cabelo.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(cabelo.matrixWorld);
      distancias.push(centro.distanceTo(cabeca.getWorldPosition(new THREE.Vector3())));
    }
    expect(Math.max(...distancias) - Math.min(...distancias)).toBeLessThan(0.15);
  });
});
