# PROGRESSO: Brasilero 3D

O Claude Code atualiza este arquivo no fim de toda sessão. Uma sessão nova começa lendo daqui.

## Estado das fases
| Fase | Estado | Último commit | Observação |
|---|---|---|---|
| R0 Revisão do guia | pronta (falta o Samuel conferir) | (fora do git: guia) | Correções em `guia-claude-code/`; resumo em DECISOES.md, seção "Revisão R0" |
| F0 Fundação | pronta (falta o Samuel conferir) | a4c0ccd | Monorepo, servidor /saude e /ws, 3 páginas, 39 testes, controle com 6,7 KB |
| F1 Sala e conexão | pronta (falta o Samuel conferir) | d0b6073 | Salas, lobby, reconexão, ping, QR, carga 18 conexões sem erro, 95 testes |
| F2 Primeiro jogo | não começou | | |
| F3 Futebol de verdade | não começou | | |
| F4 No ar | não começou | | |
| F5 Times e uniformes | não começou | | |
| F6 Visual 3D realista | não começou | | |
| F7 Som e acabamento | não começou | | |

Estados possíveis: não começou, em andamento, pronta (falta o Samuel conferir), conferida.

## Onde parou
F1 pronta. Próximo passo: F2 (Primeiro jogo), depois que o Samuel conferir a F1 e responder "sim". Nada pela metade.

## Dúvidas para o Samuel
Decisões provisórias (regra do jogo) que o guia não cobria. Sigo com a opção mais simples; diga se quer outra:
1. **Limite de 5 humanos por lado.** Quem tenta entrar num lado cheio recebe `LADO_CHEIO`. (SPEC 4.1)
2. **"Pronto" só informativo.** O Dono pode começar com qualquer número de prontos. (SPEC 3.2)
3. **Cores dos goleiros fixas:** Casa amarelo `#E6D800`, Visitante laranja `#FF7F11`. (SPEC 9.3)
4. **Números de física que mudei na R0:** domínio 9 → 14 m/s e passe máximo 20 → 16 m/s, porque com os valores antigos ninguém conseguia receber um passe. Confirmar no sentimento do jogo na F3.
5. **Aviso do npm:** o `npm install` avisa que o `esbuild` tem script de instalação ainda não aprovado (`npm approve-scripts`). Nada quebra sem ele (tsx, vitest e vite funcionam), então não mexi.
6. **Reconexão e Dono (F1):** o Dono só passa para o próximo quando a vaga dele vence (30 s sem voltar), não no instante em que a conexão cai. Assim um Wi-Fi que pisca não tira o Dono. Se ele fechar o app de propósito, os outros esperam até 30 s para ter um novo Dono.
7. **Mesmo clube nos dois lados:** se o Dono escolhe para a Casa o clube que está no Visitante, os dois trocam de lugar (o servidor não deixa os dois iguais).
8. **Telão sozinho (F1):** o telão vira "principal" por ordem de chegada; se o principal sair, o mais antigo que sobrou assume.
9. **F4:** o servidor poderia servir também o site (um túnel só, sem Vercel). Decido na F4; aviso antes de mudar a arquitetura.

## Testes que o Samuel precisa fazer
F0 (já valia): `npm install`; `npm run dev`.
F1 (PC como telão + 2 celulares na mesma Wi-Fi):
1. No PC abra `http://localhost:5173/tela.html` e clique em "Criar sala". Aparecem o código de 4 letras e o QR.
2. No celular 1, aponte a câmera para o QR, digite o apelido e toque em "Entrar". O apelido aparece no telão. Esse celular é o Dono (tem o painel com clubes, modo, duração...).
3. No celular 2, faça o mesmo. Não é Dono e não vê o painel. Cada um escolhe Casa, Visitante ou Tanto faz e toca em "Pronto".
4. No celular do Dono, mude o clube da Casa, o modo e a duração: o telão muda na hora.
5. Desligue o Wi-Fi de um celular por 10 s e religue: aparece "Reconectando...", o telão mostra "sem sinal" nesse jogador, e ele volta como o mesmo jogador (e Dono, se era).
6. Recarregue a página do telão: volta para a mesma sala. Recarregue o celular: volta para o mesmo jogador.
7. O botão "Começar" ainda só avisa que o jogo chega na próxima fase.
8. Se o celular não abrir o link do QR: Firewall do Windows (permitir o Node em redes privadas) e confira que o PC e o celular estão na mesma Wi-Fi.

## Registro das sessões
| Data | Fase | O que foi feito | Commits |
|---|---|---|---|
| 04/11/2026 | preparação | Pasta e guias criados pelo Jarvis | (sem git ainda) |
| 04/11/2026 | R0 | Revisão do guia, 10 correções pequenas nos arquivos do guia, seção "Revisão R0" no DECISOES.md | (guia fora do git) |
| 04/11/2026 | F0 | Monorepo, constantes, rng, vetores, dados, servidor mínimo, 3 páginas, checagem do controle | 845d52d, a4c0ccd |
| 04/11/2026 | F1 | Protocolo do lobby, salas e reconexão com token, telas de lobby do telão e do controle, ferramenta de carga | e610a10, 860b1f1, d0b6073 |
