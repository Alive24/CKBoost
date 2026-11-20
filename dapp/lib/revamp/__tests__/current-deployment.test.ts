import deployments from "../../../../deployments.json";
import { DeploymentManager, type ContractType, type DeploymentHistory, type DeploymentRecord, type Network } from "@/lib/ckb/deployment-manager";
import { currentDeployment, getCurrentProtocolTypeScript } from "@/lib/ckb/current-deployment";
import { getProtocolTypeScript } from "@/lib/ckb/protocol-cells";

jest.mock("ssri-ckboost/logging", () => ({ createScopedLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

it("reads the exact authoritative current records and omits deployment history from its build constant", () => {
  expect(JSON.parse(process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS!)).toEqual(deployments.current);
  expect(JSON.parse(process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS!)).not.toHaveProperty("history");
  const legacy = new DeploymentManager();
  expect(getCurrentProtocolTypeScript()).toEqual(getProtocolTypeScript());
  for (const network of ["testnet", "mainnet"] as Network[]) {
    for (const contract of Object.keys(deployments.current.testnet) as ContractType[]) {
      expect(currentDeployment.getCurrentDeployment(network, contract)).toBe(legacy.getCurrentDeployment(network, contract));
      expect(currentDeployment.getContractCodeHash(network, contract)).toBe(legacy.getContractCodeHash(network, contract));
      expect(currentDeployment.getContractOutPoint(network, contract)).toEqual(legacy.getContractOutPoint(network, contract));
      expect(currentDeployment.getContractTypeScript(network, contract)).toEqual(legacy.getContractTypeScript(network, contract));
    }
  }
});

it("preserves legacy addDeployment to immediate protocol-script reads and history", () => {
  const manager = new DeploymentManager();
  const network = manager.getCurrentNetwork();
  const data = deployments as unknown as DeploymentHistory;
  const previous = data.current[network].ckboostProtocolType;
  if (!previous) throw new Error("The protocol deployment fixture is required.");
  const historyLength = manager.getHistory(network).length;
  const replacement: DeploymentRecord = { ...previous, transactionHash: `0x${"a1".repeat(32)}`, typeHash: `0x${"b2".repeat(32)}`, contractName: "test-only" };
  try {
    manager.addDeployment(network, "ckboostProtocolType", replacement);
    expect(currentDeployment.getCurrentDeployment(network, "ckboostProtocolType")).toBe(replacement);
    expect(getProtocolTypeScript().codeHash).toBe(replacement.typeHash);
    expect(manager.getHistory(network)).toHaveLength(historyLength + 1);
  } finally {
    data.current[network].ckboostProtocolType = previous;
    data.history[network].splice(historyLength);
  }
});

it("loads the real shared protocol helper without the browser-only build constant", () => {
  const serialized = process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS;
  const network = process.env.NEXT_PUBLIC_CKB_NETWORK;
  delete process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS;
  process.env.NEXT_PUBLIC_CKB_NETWORK = "testnet";
  try {
    // This is the shared import used by independent server/function bundles,
    // not a mock and not dependent on a previously imported manager instance.
    jest.isolateModules(() => {
      const shared = require("@/lib/ckb/protocol-cells") as typeof import("@/lib/ckb/protocol-cells");
      expect(shared.getProtocolTypeScript().codeHash).toBe(deployments.current.testnet.ckboostProtocolType.typeHash);
    });
  } finally {
    if (serialized === undefined) delete process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS;
    else process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS = serialized;
    if (network === undefined) delete process.env.NEXT_PUBLIC_CKB_NETWORK;
    else process.env.NEXT_PUBLIC_CKB_NETWORK = network;
  }
});
