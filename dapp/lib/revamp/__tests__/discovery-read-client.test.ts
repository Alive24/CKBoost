import { ccc } from "@ckb-ccc/connector-react";
import { getDiscoveryReadClient, DISCOVERY_RPC_URLS, DISCOVERY_TRANSPORT_TIMEOUT_MS } from "../discovery-read-client";
import { DISCOVERY_TIMEOUT_MS } from "../discovery-loader";

jest.mock("@ckb-ccc/connector-react", () => ({ccc: {
  ClientPublicTestnet: jest.fn().mockImplementation(config => ({network: "testnet", config})),
  ClientPublicMainnet: jest.fn().mockImplementation(config => ({network: "mainnet", config})),
}}));

it("uses network-scoped HTTPS-only discovery clients without touching any wallet provider", () => {
  const testnet = getDiscoveryReadClient("testnet");
  expect(getDiscoveryReadClient("testnet")).toBe(testnet);
  expect(getDiscoveryReadClient("mainnet")).not.toBe(testnet);
  expect(ccc.ClientPublicTestnet).toHaveBeenCalledTimes(1);
  expect(ccc.ClientPublicMainnet).toHaveBeenCalledTimes(1);
  expect(ccc.ClientPublicTestnet).toHaveBeenCalledWith({url: DISCOVERY_RPC_URLS.testnet[0], fallbacks: [...DISCOVERY_RPC_URLS.testnet.slice(1)], timeout: DISCOVERY_TRANSPORT_TIMEOUT_MS});
  expect(Object.values(DISCOVERY_RPC_URLS).flat().every(url => url.startsWith("https://"))).toBe(true);
  expect(DISCOVERY_TRANSPORT_TIMEOUT_MS * DISCOVERY_RPC_URLS.testnet.length).toBeLessThan(DISCOVERY_TIMEOUT_MS);
});
