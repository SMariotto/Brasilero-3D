import { ERROS_FATAIS, type CodigoErro } from "@b3d/core";

/**
 * O que o telão faz com um `erro` do servidor (H7). Até a H6 o telão não mandava nada além da câmera, então qualquer `erro` era a
 * sala que não existe, o servidor cheio, a versão errada...: voltar à tela inicial. Com o menu o telão passa a mandar ações, e uma
 * recusa (`SEM_PERMISSAO`, `ALVO_INVALIDO`, `LADO_CHEIO`...) não pode jogar o PC para fora da sala.
 *   voltar: erro fatal (`ERROS_FATAIS`): o cliente já parou de tentar; volta à tela inicial com o motivo.
 *   avisar: o resto: o telão continua na sala e mostra o texto por alguns segundos.
 */
export function reacaoAoErro(codigo: CodigoErro): "voltar" | "avisar" {
  return ERROS_FATAIS.includes(codigo) ? "voltar" : "avisar";
}

/** Quanto tempo (ms) o aviso de um erro não fatal fica na tela do telão. */
export const AVISO_DO_TELAO_MS = 4000;
