# Brasilero 3D

Futebol 3D para jogar com os amigos: a TV (ou o PC) mostra o jogo e cada pessoa controla o próprio jogador pelo celular.

1. Precisa do Node 22 ou mais novo (testado no 24). Na pasta do projeto: `npm install`
2. `npm run dev` sobe o servidor (porta 8787) e o site (porta 5173) juntos, abertos para a rede local.
3. No PC: abra `http://localhost:5173/tela.html` (telão). Tem que aparecer "conectado".
4. No celular, na mesma Wi-Fi: abra `http://IP-DO-PC:5173/controle.html`. Descubra o IP com `ipconfig` (campo "Endereço IPv4"). Se não abrir, libere o Node no Firewall do Windows (redes privadas).
5. `npm test`: testes. `npm run typecheck`: checagem de tipos. `npm run build`: gera o site em `apps/web/dist` e confere que o controle tem menos de 300 KB.
6. `npm run carga`: teste de carga com clientes falsos (fica pronto na F1).

As regras do jogo, a arquitetura e as fases estão em `../guia-claude-code/`. O estado do trabalho está em `PROGRESSO.md`.
