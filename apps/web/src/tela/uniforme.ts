import * as THREE from "three";
import type { PadraoCamisa, UniformeResolvido } from "@b3d/core";

// Uniforme por shader (ARQUITETURA 6.3): o padrão da camisa é pintado a partir da POSIÇÃO no espaço do modelo, não da UV.
// Assim funciona igual na cápsula de hoje e em qualquer personagem do Mixamo na F6, sem refazer textura.
// Regiões por altura (0 = pé, 1 = topo da cabeça): chuteira, meião, calção, camisa e pele (cabeça).

/** Número de cada padrão dentro do shader. */
export const NUMERO_DO_PADRAO: Record<PadraoCamisa, number> = {
  liso: 0,
  "listras-verticais": 1,
  "listras-horizontais": 2,
  "faixa-diagonal": 3,
  "faixa-horizontal": 4,
  "metade-vertical": 5,
  "mangas-contraste": 6,
};

export const PADROES: PadraoCamisa[] = Object.keys(NUMERO_DO_PADRAO) as PadraoCamisa[];

const COR_PELE = "#d9a066";
const COR_CHUTEIRA = "#121212";

/** Limites (fração da altura do corpo) entre as regiões. Ficam aqui para a cápsula e o modelo da F6 usarem os mesmos. */
export const REGIOES = { chuteira: 0.05, meiao: 0.3, calcao: 0.47, camisa: 0.87 } as const;

const DECLARACOES = /* glsl */ `
uniform vec3 uCor1;
uniform vec3 uCor2;
uniform vec3 uCalcao;
uniform vec3 uMeiao;
uniform vec3 uPele;
uniform vec3 uChuteira;
uniform int uPadrao;
uniform float uAltura;
uniform float uBase;
varying vec3 vPosModelo;

vec3 corDoUniforme() {
  float h = clamp((vPosModelo.y - uBase) / uAltura, 0.0, 1.0);
  if (h > ${REGIOES.camisa.toFixed(2)}) return uPele;
  if (h < ${REGIOES.chuteira.toFixed(2)}) return uChuteira;
  if (h < ${REGIOES.meiao.toFixed(2)}) return uMeiao;
  if (h < ${REGIOES.calcao.toFixed(2)}) return uCalcao;

  // Camisa: t volta em torno do corpo (0 a 1), y sobe da barra ao ombro (0 a 1), z é o lado do corpo (esquerda e direita)
  float t = atan(vPosModelo.z, vPosModelo.x) / 6.2831853 + 0.5;
  float y = (h - ${REGIOES.calcao.toFixed(2)}) / (${REGIOES.camisa.toFixed(2)} - ${REGIOES.calcao.toFixed(2)});
  float lado = vPosModelo.z;

  if (uPadrao == 1) return mod(floor(t * 12.0), 2.0) < 1.0 ? uCor1 : uCor2;                  // listras verticais
  if (uPadrao == 2) return mod(floor(y * 6.0), 2.0) < 1.0 ? uCor1 : uCor2;                   // listras horizontais
  if (uPadrao == 3) return abs(lado * 2.2 + (y - 0.5) * 2.0) < 0.5 ? uCor2 : uCor1;          // faixa diagonal (do ombro ao quadril)
  if (uPadrao == 4) return (y > 0.36 && y < 0.64) ? uCor2 : uCor1;                           // faixa horizontal no peito
  if (uPadrao == 5) return lado > 0.0 ? uCor1 : uCor2;                                       // metade vertical
  if (uPadrao == 6) return (abs(lado) > 0.2 && y > 0.5) ? uCor2 : uCor1;                     // mangas em contraste
  return uCor1;                                                                              // liso
}
`;

export interface OpcoesMaterial {
  /** Altura do modelo e onde fica o pé, no espaço do modelo (a cápsula vai de -0,9 a 0,9). */
  altura?: number;
  base?: number;
}

/**
 * Material do jogador com o uniforme pintado por shader. Troque as cores depois com `aplicarUniforme`.
 * É um `MeshStandardMaterial` normal por baixo, então luz, sombra e névoa funcionam como em qualquer outro.
 */
export function criarMaterialUniforme(inicial: UniformeResolvido, opcoes: OpcoesMaterial = {}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  const altura = opcoes.altura ?? 1.8;
  const base = opcoes.base ?? -0.9;

  material.onBeforeCompile = (shader) => {
    // Lê o uniforme na hora de compilar (se `aplicarUniforme` rodou antes do primeiro desenho, vale o novo)
    const u = material.userData["uniforme"] as UniformeResolvido;
    shader.uniforms["uCor1"] = { value: new THREE.Color(u.cor1) };
    shader.uniforms["uCor2"] = { value: new THREE.Color(u.cor2) };
    shader.uniforms["uCalcao"] = { value: new THREE.Color(u.calcao) };
    shader.uniforms["uMeiao"] = { value: new THREE.Color(u.meiao) };
    shader.uniforms["uPele"] = { value: new THREE.Color(COR_PELE) };
    shader.uniforms["uChuteira"] = { value: new THREE.Color(COR_CHUTEIRA) };
    shader.uniforms["uPadrao"] = { value: NUMERO_DO_PADRAO[u.padrao] };
    shader.uniforms["uAltura"] = { value: altura };
    shader.uniforms["uBase"] = { value: base };
    material.userData["shader"] = shader;

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPosModelo;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPosModelo = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${DECLARACOES}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = corDoUniforme();");
  };
  // Padrões diferentes usam o mesmo programa; só os valores dos uniformes mudam.
  material.customProgramCacheKey = () => "uniforme-b3d";
  material.userData["uniforme"] = inicial;
  return material;
}

/** Troca as cores e o padrão de um material criado por `criarMaterialUniforme` sem recriar nada. */
export function aplicarUniforme(material: THREE.Material, u: UniformeResolvido): void {
  material.userData["uniforme"] = u;
  const shader = material.userData["shader"] as THREE.WebGLProgramParametersWithUniforms | undefined;
  if (!shader) return; // ainda não compilou: o `onBeforeCompile` vai ler o uniforme novo guardado acima
  (shader.uniforms["uCor1"]!.value as THREE.Color).set(u.cor1);
  (shader.uniforms["uCor2"]!.value as THREE.Color).set(u.cor2);
  (shader.uniforms["uCalcao"]!.value as THREE.Color).set(u.calcao);
  (shader.uniforms["uMeiao"]!.value as THREE.Color).set(u.meiao);
  shader.uniforms["uPadrao"]!.value = NUMERO_DO_PADRAO[u.padrao];
}
