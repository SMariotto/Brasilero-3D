# CLAUDE.md: projeto do Brasilero 3D

Código do jogo. A especificação mora em `../guia-claude-code/` e manda em tudo: SPEC (o jogo), ARQUITETURA (o código), PROTOCOLO (as mensagens), FASES (a ordem e o critério de pronto), DECISOES (o porquê).

## Regras de trabalho
1. **Uma fase por vez**, na ordem do `FASES.md`. Comece lendo o `PROGRESSO.md`.
2. **Commit por marco**, mensagens em português com prefixo da fase (`F2: física básica`). Antes de cada commit: `npm test`, `npm run typecheck` e `npm run build` passando.
3. **Sem `git push`.** O Samuel faz o push.
4. **Não apague nada fora de `projeto/`.** Dentro de `projeto/`, só apague o que a própria sessão criou; para o resto, pergunte.
5. **Não invente dado.** Se a SPEC não diz, ou diz algo impossível, anote em `PROGRESSO.md` (seção "Dúvidas para o Samuel") e siga com a opção mais simples, marcada como provisória.
6. **Números de física e de jogo só em `packages/core/src/constantes.ts`.**
7. **Nada de escudo, logo ou camisa de clube real** baixado ou desenhado. Escudos só os PNGs que o Samuel colocar em `apps/web/public/escudos/`.
8. **Nada de CDN em tempo de execução.** Tudo vem do npm e vai no build.
9. **Controle leve:** `controle.html` nunca importa Three.js nem nada de `src/tela/`.
10. **Windows:** o Samuel usa PowerShell 5.1. Em instruções para ele, comandos em uma linha usam `;` (não `&&`). Scripts do npm devem funcionar no Windows (use Node para mexer em arquivos, não `rm`, `cp` ou `mv`). O caminho tem espaço: sempre aspas.
11. **Limite de uso:** se estiver acabando, pare num commit limpo e escreva no `PROGRESSO.md` exatamente onde parou e qual é o próximo passo.
12. **Relatório no fim de toda sessão:** o que foi feito, commits (hash e mensagem), como o Samuel testa (passo a passo, PC e celular), pendências. Curto.

## Comandos (a partir da F0)
| Comando | O que faz |
|---|---|
| `npm run dev` | servidor + site em modo desenvolvimento, aberto para a rede local |
| `npm test` | testes |
| `npm run typecheck` | checagem de tipos |
| `npm run build` | build do site e checagem do tamanho do controle |
| `npm run carga` | teste de carga com clientes falsos |
| `npm run festa` | (F4) servidor + túnel Cloudflare para jogar com amigos de outras casas |
