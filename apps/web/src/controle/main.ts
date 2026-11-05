import "../comum/estilo.css";
import { mostrarConexao } from "../comum/pagina";

// F0: só prova que o controle fala com o servidor. Joystick e botões entram na F2.
// Este arquivo nunca importa Three.js nem nada de src/tela/ (o build confere o tamanho).
mostrarConexao({ t: "ola", sala: "TESTE", apelido: "F0" });
