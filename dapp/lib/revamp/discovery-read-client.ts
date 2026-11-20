import { ccc } from "@ckb-ccc/connector-react";
import type { Network } from "@/lib/ckb/deployment-manager";

export const DISCOVERY_TRANSPORT_TIMEOUT_MS = 4_000;
export const DISCOVERY_RPC_URLS: Record<Network, readonly string[]> = {
  testnet: ["https://testnet.ckbapp.dev/", "https://testnet.ckb.dev/"],
  mainnet: ["https://mainnet.ckbapp.dev/", "https://mainnet.ckb.dev/"],
};
const clients = new Map<Network, ccc.Client>();

/** Home's public reads never wait for the wallet client's WebSocket fallback.
 * This client is private to discovery; it is never installed into the wallet
 * provider or used to sign/send transactions. Two bounded HTTPS transports
 * complete before the existing 12-second UI request deadline.
 */
export function getDiscoveryReadClient(network: Network): ccc.Client {
  const cached = clients.get(network);
  if (cached) return cached;
  const [url, ...fallbacks] = DISCOVERY_RPC_URLS[network];
  const config = {url, fallbacks, timeout: DISCOVERY_TRANSPORT_TIMEOUT_MS};
  const client = network === "mainnet" ? new ccc.ClientPublicMainnet(config) : new ccc.ClientPublicTestnet(config);
  clients.set(network, client);
  return client;
}
