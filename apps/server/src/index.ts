import { SERVIDOR } from "@b3d/core";
import { criarServidor } from "./servidor";

const porta = Number(process.env["PORT"] ?? SERVIDOR.portaPadrao);

const servidor = await criarServidor({ porta });
console.log(`Servidor do Brasilero 3D no ar na porta ${servidor.porta()}`);
console.log(`  saúde:     http://localhost:${servidor.porta()}/saude`);
console.log(`  WebSocket: ws://localhost:${servidor.porta()}/ws`);
