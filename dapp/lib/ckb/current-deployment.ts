import type { ContractType, DeploymentHistory, DeploymentRecord, Network } from "./deployment-manager";
import { getIsolatedRuntime } from "./isolated-runtime.mjs";

type CurrentDeployments = DeploymentHistory["current"];

/** Next compiles only the current section of the authoritative deployment file
 * into this constant. No history JSON or full manager enters discovery. */
let current: CurrentDeployments | null = process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS
  ? JSON.parse(process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS) as CurrentDeployments
  : null;

/** When the legacy manager is loaded, share its mutable current object so its
 * existing addDeployment API remains immediately visible to read helpers. */
export function bindCurrentDeploymentData(data: CurrentDeployments): void {
  current = (getIsolatedRuntime()?.current as unknown as CurrentDeployments | undefined) ?? data;
}

export const currentDeployment = {
  getCurrentNetwork(): Network {
    if (getIsolatedRuntime()) return "testnet";
    return process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet" ? "mainnet" : "testnet";
  },
  getCurrentDeployment(network: Network, contract: ContractType): DeploymentRecord | null {
    const isolated = getIsolatedRuntime();
    if (isolated) {
      if (network !== "testnet") throw new Error("Isolated QA cannot read mainnet deployments.");
      return isolated.current.testnet[contract] as unknown as DeploymentRecord | null;
    }
    if (!current) throw new Error("Current deployment configuration is unavailable. Rebuild the application.");
    return current[network][contract] || null;
  },
  getContractOutPoint(network: Network, contract: ContractType) {
    const deployment = this.getCurrentDeployment(network, contract);
    return deployment ? { txHash: deployment.transactionHash, index: deployment.index } : null;
  },
  getContractCodeHash(network: Network, contract: ContractType) {
    return this.getCurrentDeployment(network, contract)?.typeHash || null;
  },
  getContractTypeScript(network: Network, contract: ContractType) {
    return this.getCurrentDeployment(network, contract)?.typeScript || null;
  },
};

/** Browser discovery only; shared server/administration reads continue to use
 * protocol-cells and its full manager without requiring a Next build constant. */
export function getCurrentProtocolTypeScript() {
  const isolated = getIsolatedRuntime();
  if (isolated) return isolated.protocol.typeScript as {codeHash:`0x${string}`;hashType:"type";args:`0x${string}`};
  const network = currentDeployment.getCurrentNetwork();
  const deployment = currentDeployment.getCurrentDeployment(network, "ckboostProtocolType");
  if (!deployment?.typeHash) throw new Error(`Protocol type contract not found in deployments.json for ${network}`);
  return { codeHash: deployment.typeHash, hashType: "type" as const, args: process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x" };
}
