# Brasilero 3D

Futebol 3D para jogar com os amigos: a TV (ou o PC) mostra o jogo e cada pessoa controla o próprio jogador pelo celular.

1. Precisa do Node 22 ou mais novo (testado no 24). Na pasta do projeto: `npm install`
2. `npm run dev` sobe o servidor (porta 8787) e o site (porta 5173) juntos, abertos para a rede local.
3. No PC: abra `http://localhost:5173/tela.html` (telão) e clique em "Criar sala". Aparecem o código de 4 letras e o QR.
4. No celular, na mesma Wi-Fi: aponte a câmera para o QR (ou abra `http://IP-DO-PC:5173/controle.html` e digite o código). Descubra o IP com `ipconfig` (campo "Endereço IPv4"). Se não abrir, libere o Node no Firewall do Windows (redes privadas).
5. `npm test`: testes. `npm run typecheck`: checagem de tipos. `npm run build`: gera o site em `apps/web/dist` e confere que o controle tem menos de 300 KB.
6. `npm run e2e`: teste de ponta a ponta (sobe servidor e site em portas de teste, abre um telão e dois celulares de mentira no Edge e joga). Sem Edge: `npx playwright install chromium` e `$env:B3D_NAVEGADOR="chromium"`.
7. `npm run festa`: joga com amigos de outras casas (túnel da Cloudflare; precisa do cloudflared: `winget install --id Cloudflare.cloudflared`).
8. `npm run carga`: teste de carga com clientes falsos (sobe um servidor próprio; 6 controles e 8 telões por 30 s). Opções: `npm run carga -- --controles 6 --telas 8 --seg 30 --url ws://localhost:8787/ws`.
9. `npm run simular`: simulador de bots contra bots (e de um driblador humano de mentira contra eles) com semente fixa; imprime por dificuldade botes, desarmes, posse, passes, chutes e gols por partida de 8 min. Opções: `npm run simular -- --partidas 10 --seg 480 --semente 7 --cenarios medio:medio,dificil:facil`.
10. `npm run medir`: mede o movimento do jogador (aceleração, frenagem, mudança de direção) e imprime uma tabela (H2). `npm run tabela-passe`: tempo e velocidade do passe rasteiro por distância, antes e depois da H3. `npm run chutes`: taxa de gol de cada tipo de chute, por zona do campo, contra um goleiro de verdade (H2; opções: `--sementes 6 --dificuldade dificil --mira centro --marcador`); com `--distancia` mostra a taxa de gol por distância ao gol, do chute de perto até a defesa do próprio time (H4).
10b. `npm run roubo`: mede o roubo de bola do humano (% de botes que dão certo, de frente, de lado e por trás, por distância; H6).
11. `node ferramentas/gerar-icones.mjs` redesenha os ícones do app (só se quiser mudar o desenho).
12. ~~`npm run boneco-teste` e o caminho Mixamo + Blender (`ferramentas/blender/`)~~ **OBSOLETO desde a G3** (o jogador agora é feito por código; nada foi apagado, o Samuel decide). `npm run boneco-teste` ainda grava um boneco de caixas para testar o carregador de GLB (`tela.html?modelo=boneco-teste`).
13. `tela.html?poses=1`: vitrine das poses do jogador feito por código (as 14 animações lado a lado; `&vel=7` muda a velocidade da corrida).
14. `tela.html?boneco=1`: vitrine do boneco novo (rig-v1) em cada estado do jogo, com as skins dos clubes (`&times=vasco,flamengo`, `&cam=lado`, `&colunas=0,4&h=700`, `&padrao=faixa-diagonal`, `&t=0.2`).

Teclas do telão: **C** troca a câmera (TV, aérea, segue um jogador), **N** troca quem é seguido, **T** abre a tabela do campeonato da sala, **M** liga/desliga o som, **P** pausa e retoma a partida (só o PC, o telão que criou a sala), **L** modo leve (sem sombras, torcida e brilho). Endereços úteis: `?segue=Apelido` abre o telão seguindo aquele jogador; `?debug=1` mostra fps e draw calls; `?capsula=1` usa cápsulas no lugar do modelo 3D; `?vitrine=1` mostra as camisas dos clubes.

As regras do jogo, a arquitetura e as fases estão em `../guia-claude-code/`. O estado do trabalho está em `PROGRESSO.md`.
