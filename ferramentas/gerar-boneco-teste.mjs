// Grava um boneco de caixas em GLB (com Camisa, Calcao, Meiao, Pele, Chuteira e 5 animações) para testar o carregador do
// modelo 3D sem precisar do Mixamo. Uso: npm run boneco-teste   e depois abra  tela.html?modelo=boneco-teste
// O arquivo não vai para o git. O modelo de verdade é apps/web/public/modelos/jogador.glb (ver ferramentas/blender/LEIA-ME.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { montarBonecoTeste } from "../apps/web/src/tela/bonecoTeste.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "apps", "web", "public", "modelos", "boneco-teste.glb");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, new Uint8Array(montarBonecoTeste()));
console.log(`Gravei ${destino}`);
console.log("Abra o telão com  ?modelo=boneco-teste  no final do endereço (ou ?capsula=1 para voltar às cápsulas).");
