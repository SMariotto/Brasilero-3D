import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ANIM, JOGADOR, type UniformeResolvido } from "@b3d/core";
import { montarBonecoTeste } from "./bonecoTeste";
import { FiguraModelo, lerModelo, papelDoMaterial, urlDoModelo } from "./modelo";

const UNIFORME: UniformeResolvido = { padrao: "listras-verticais", cor1: "#c8102e", cor2: "#ffffff", calcao: "#111111", meiao: "#ffffff" };

describe("urlDoModelo", () => {
  it("usa jogador.glb por padrão e deixa pedir outro para testar", () => {
    expect(urlDoModelo("")).toBe("/modelos/jogador.glb");
    expect(urlDoModelo("?modelo=boneco-teste", "/jogo/")).toBe("/jogo/modelos/boneco-teste.glb");
  });

  it("?capsula=1 força as cápsulas e nomes estranhos são recusados", () => {
    expect(urlDoModelo("?capsula=1")).toBeNull();
    expect(urlDoModelo("?modelo=../segredo")).toBeNull();
    expect(urlDoModelo("?modelo=a/b")).toBeNull();
  });
});

describe("papelDoMaterial", () => {
  it("acha camisa, calção e meião pelos nomes do script do Blender e por nomes parecidos", () => {
    expect(papelDoMaterial("Camisa")).toBe("camisa");
    expect(papelDoMaterial("Calcao")).toBe("calcao");
    expect(papelDoMaterial("Meiao")).toBe("meiao");
    expect(papelDoMaterial("Calção")).toBe("calcao");
    expect(papelDoMaterial("Jersey_Mat")).toBe("camisa");
    expect(papelDoMaterial("Shorts")).toBe("calcao");
  });

  it("pele, cabelo e chuteira ficam como o modelo veio", () => {
    expect(papelDoMaterial("Pele")).toBeNull();
    expect(papelDoMaterial("Cabelo")).toBeNull();
    expect(papelDoMaterial("Chuteira")).toBeNull();
  });
});

describe("modelo 3D (boneco de teste)", () => {
  it("lê o GLB, acha a camisa e escala para a altura do jogador com os pés no chão", async () => {
    const m = await lerModelo(montarBonecoTeste());
    expect(m.temCamisa).toBe(true);
    expect(m.altura).toBeCloseTo(1.8, 2);
    expect(m.nomesDosClipes).toEqual(new Set(["Parado", "Corrida", "Chute", "Queda", "GoleiroParado"]));

    m.raiz.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(m.raiz);
    expect(caixa.min.y).toBeCloseTo(0, 2);
    expect(caixa.max.y).toBeCloseTo(JOGADOR.alturaCorpo, 2);
  });

  it("cada jogador tem cópia e uniforme próprios", async () => {
    const m = await lerModelo(montarBonecoTeste());
    const a = new FiguraModelo(m, UNIFORME);
    const b = new FiguraModelo(m, { ...UNIFORME, cor1: "#006437", calcao: "#ffffff" });
    expect(a.raiz).not.toBe(b.raiz);

    const cor = (f: FiguraModelo, nome: string): THREE.Material => {
      let achado: THREE.Material | null = null;
      f.raiz.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name === nome) achado = mesh.material as THREE.Material;
      });
      return achado!;
    };
    const calcaoA = cor(a, "Calcao") as THREE.MeshStandardMaterial;
    const calcaoB = cor(b, "Calcao") as THREE.MeshStandardMaterial;
    expect(calcaoA).not.toBe(calcaoB);
    expect(calcaoA.color.getHexString()).toBe("111111");
    expect(calcaoB.color.getHexString()).toBe("ffffff");
    expect(cor(a, "Tronco").userData["uniforme"]).toEqual(UNIFORME);
    // O modelo original não foi tocado
    expect(m.raiz).not.toBe(a.raiz);
  });

  it("troca de animação pelo estado do snapshot e cai na reserva quando falta o clipe", async () => {
    const m = await lerModelo(montarBonecoTeste());
    const f = new FiguraModelo(m, UNIFORME);
    const tocando = (): string[] => {
      const nomes: string[] = [];
      // Os clipes existentes: o que tem peso > 0,5 está tocando
      for (const nome of m.nomesDosClipes) {
        const a = (f as unknown as { acoes: Map<string, THREE.AnimationAction> }).acoes.get(nome);
        if (a && a.getEffectiveWeight() > 0.5) nomes.push(nome);
      }
      return nomes;
    };

    // No primeiro quadro o fade-in mal começou: espera o crossfade acabar
    for (let i = 0; i < 30; i++) f.atualizar(ANIM.parado, 0, 0.016);
    expect(tocando()).toEqual(["Parado"]);
    for (let i = 0; i < 30; i++) f.atualizar(ANIM.corrida, 5, 0.016);
    expect(tocando()).toEqual(["Corrida"]);
    for (let i = 0; i < 30; i++) f.atualizar(ANIM.chute, 5, 0.016);
    expect(tocando()).toEqual(["Chute"]);
    // O boneco não tem "Cobranca": usa Parado
    for (let i = 0; i < 30; i++) f.atualizar(ANIM.cobranca, 0, 0.016);
    expect(tocando()).toEqual(["Parado"]);
    // Nem "GoleiroComBola": usa GoleiroParado
    for (let i = 0; i < 30; i++) f.atualizar(ANIM.goleiroComBola, 0, 0.016);
    expect(tocando()).toEqual(["GoleiroParado"]);
  });

  it("a animação realmente mexe o modelo", async () => {
    const m = await lerModelo(montarBonecoTeste());
    const f = new FiguraModelo(m, UNIFORME);
    f.atualizar(ANIM.queda, 0, 0.016);
    for (let i = 0; i < 60; i++) f.atualizar(ANIM.queda, 0, 0.016);
    f.raiz.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(f.raiz);
    // Caído: bem mais baixo do que em pé
    expect(caixa.max.y).toBeLessThan(JOGADOR.alturaCorpo * 0.6);
    f.liberar();
  });
});
