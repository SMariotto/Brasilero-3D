# Brasilero 3D

Futebol 3D para jogar com os amigos: a TV (ou o PC) mostra o jogo e cada pessoa controla o próprio jogador pelo celular.

1. Precisa do Node 22 ou mais novo (testado no 24). Na pasta do projeto: `npm install`
2. `npm run dev` sobe o servidor (porta 8787) e o site (porta 5173) juntos, abertos para a rede local.
3. No PC: abra `http://localhost:5173/tela.html` (telão) e clique em "Criar sala". Aparecem o código de 4 letras e o QR.
4. No celular, na mesma Wi-Fi: aponte a câmera para o QR (ou abra `http://IP-DO-PC:5173/controle.html` e digite o código). Descubra o IP com `ipconfig` (campo "Endereço IPv4"). Se não abrir, libere o Node no Firewall do Windows (redes privadas).
5. `npm test`: testes. `npm run typecheck`: checagem de tipos. `npm run build`: gera o site em `apps/web/dist` e confere que o controle tem menos de 300 KB.
6. `npm run e2e`: teste de ponta a ponta (sobe servidor e site em portas de teste, abre um telão e dois celulares de mentira no Edge e joga). Sem Edge: `npx playwright install chromium` e `$env:B3D_NAVEGADOR="chromium"`.
7. `npm run festa`: joga com amigos de outras casas (túnel da Cloudflare; precisa do cloudflared: `winget install --id Cloudflare.cloudflared`).
8. `npm run carga`: teste de carga com clientes falsos (sobe um servidor próprio; 10 controles e 8 telões por 30 s). Opções: `npm run carga -- --controles 10 --telas 8 --seg 30 --url ws://localhost:8787/ws`.

As regras do jogo, a arquitetura e as fases estão em `../guia-claude-code/`. O estado do trabalho está em `PROGRESSO.md`.
