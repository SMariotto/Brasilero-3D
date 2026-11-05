import { networkInterfaces } from "node:os";

/** Placas de rede que quase nunca são a Wi-Fi ou o cabo que o celular enxerga. */
const PLACA_VIRTUAL = /vethernet|virtualbox|vmware|wsl|docker|loopback|bluetooth|hyper-v/i;

/** Endereços IPv4 do PC na rede local, na ordem em que o sistema lista. O telão usa o primeiro para montar o QR em desenvolvimento. */
export function ipsDaRede(): string[] {
  const ips: string[] = [];
  for (const [nome, enderecos] of Object.entries(networkInterfaces())) {
    if (PLACA_VIRTUAL.test(nome)) continue;
    for (const e of enderecos ?? []) {
      if (e.family === "IPv4" && !e.internal) ips.push(e.address);
    }
  }
  return ips;
}
