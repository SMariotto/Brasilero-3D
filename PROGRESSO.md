# PROGRESSO: Brasilero 3D

O Claude Code atualiza este arquivo no fim de toda sessão. Uma sessão nova começa lendo daqui.

## Estado das fases
| Fase | Estado | Último commit | Observação |
|---|---|---|---|
| R0 Revisão do guia | pronta (falta o Samuel conferir) | (fora do git: guia) | Correções em `guia-claude-code/`; resumo em DECISOES.md, seção "Revisão R0" |
| F0 Fundação | pronta (falta o Samuel conferir) | a4c0ccd | Monorepo, servidor /saude e /ws, 3 páginas, 39 testes, controle com 6,7 KB |
| F1 Sala e conexão | pronta (falta o Samuel conferir) | d0b6073 | Salas, lobby, reconexão, ping, QR, carga 18 conexões sem erro, 95 testes |
| F2 Primeiro jogo | pronta (falta o Samuel conferir) | 702e32f | Física, partida, protocolo binário, laço 60 Hz, telão 3D, controle com joystick, 243 testes + 2 Playwright |
| F3 Futebol de verdade | não começou | | |
| F4 No ar | não começou | | |
| F5 Times e uniformes | não começou | | |
| F6 Visual 3D realista | não começou | | |
| F7 Som e acabamento | não começou | | |

Estados possíveis: não começou, em andamento, pronta (falta o Samuel conferir), conferida.

## Onde parou
F2 pronta. Próximo passo: F3 (Futebol de verdade; o guia sugere fazer em duas partes, A e B), depois que o Samuel conferir a F2 e responder "sim". Nada pela metade.

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
9. **F2, regras que eu completei (confirme ou mande mudar):**
   - *Paredes da Arena valem em qualquer altura:* a bola nunca sai por cima da parede de 1 m (o desenho tem 1 m, a regra não deixa passar). A boca do gol fica aberta até o travessão.
   - *Dá para entrar com a bola andando:* sem goleiro (F3), o jogador que conduz a bola para dentro do gol faz gol. Fica assim até o goleiro existir.
   - *Saída de bola:* cada time na sua metade, adversários a 4 m da bola, o jogo solta quando quem cobra toca na bola ou em 3 s. Comemoração do gol: 3 s com o relógio parado.
   - *Passe da F2:* rasteiro, 12 m/s, na direção do joystick (a mira em companheiro e o lançamento entram na F3). Chute com a mira assistida e erro angular já valem.
   - *Quem entra com a partida rolando* fica em espera até a próxima (Revanche) e quem cai fica parado na vaga por 30 s (bot só na F3).
   - *Constantes novas provisórias* (a SPEC não define): mola de condução 180/26, toque de drible +2 m/s, quique mínimo 1 m/s, rebote no corpo 0,5, rede com 2 m de fundo. Todas em `constantes.ts`.
   - *Telão:* a bola é desenhada com o dobro do tamanho para dar para ler da TV; o relógio do servidor é estimado pelo caminho de rede mais rápido, não por ping/pong (ver PROTOCOLO 7).
10. **F4:** o servidor poderia servir também o site (um túnel só, sem Vercel). Decido na F4; aviso antes de mudar a arquitetura.

## Testes que o Samuel precisa fazer
F2 (1 contra 1 com 2 celulares, PC como telão):
1. `npm run dev`; no PC abra `http://localhost:5173/tela.html` e clique em "Criar sala"; entre com os 2 celulares pelo QR (de preferência deitados).
2. Um celular escolhe Casa e o outro Visitante. O primeiro (Dono) toca em "Começar". O telão mostra o campo 3D, o placar e o relógio; os celulares mostram joystick e 3 botões.
3. Joystick à esquerda move o jogador. Aperte CHUTE segurando: a barra laranja no topo enche em 0,8 s; solte para chutar (toque rápido dá chute fraco). PASSE sai rasteiro. CORRER gasta a barra de energia verde.
4. Jogue 2 minutos: tem que sair gol, e depois do gol a bola volta ao centro e quem sofreu o gol sai jogando. Dá para trocar a câmera com a tecla C no PC ou no botão "Câmera".
5. No fim, o telão mostra o resultado e o Dono escolhe "Revanche" ou "Lobby" no celular.
6. **Sentimento do jogo** (é o que eu mais preciso de você): o jogador responde ao dedo sem atraso que incomode? A bola "gruda" demais no pé ou escapa demais? O chute está forte/fraco demais? Anote e me diga, que eu ajusto só as constantes.

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
| 04/11/2026 | F2 | Física (bola, jogador, campo), partida (saída, domínio, chute, passe, gol, assistência, relógio, fim), protocolo binário, laço do servidor, telão 3D, controle de jogo, Playwright | 65153a3, 87c2afc, 557daff, 702e32f |
