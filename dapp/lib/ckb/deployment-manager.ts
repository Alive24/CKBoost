// Deployment Manager - Manages deployment records for CKB contracts
// This module handles reading and updating deployment information

import deploymentsData from "../../../deployments.json";
import { ccc } from "@ckb-ccc/connector-react";
import { createScopedLogger } from "ssri-ckboost/logging";
import { bindCurrentDeploymentData } from "./current-deployment";
import { getIsolatedRuntime } from "./isolated-runtime.mjs";

const log = createScopedLogger("DeploymentManager");

export type Network = "testnet" | "mainnet";

export type ContractType =
  | "ckboostProtocolType"
  | "ckboostCampaignType"
  | "ckboostUserType"
  | "ckboostProtocolLock"
  | "ckboostFundingLock"
  | "ckboostUserLock"
  | "ckboostPointsUdt"
  | "ckboostTippingType"
  | "ckboostAchievementType";

export interface DeploymentRecord {
  transactionHash: ccc.Hex;
  index: ccc.Num;
  deployedAt: ccc.Num;
  contractName: string;
  deployerAddress?: ccc.Hex;
  dataHash?: ccc.Hex;
  contractSize?: ccc.Num;
  tag?: string;
  isUpgrade?: boolean;
  previousDeployment?: {
    transactionHash: ccc.Hex;
    index: ccc.Num;
    deployedAt: ccc.Num;
    tag?: string;
  };
  typeScript?: ccc.ScriptLike;
  isTypeId?: boolean;
  typeHash?: ccc.Hex;
}

export interface DeploymentHistory {
  current: {
    testnet: {
      ckboostProtocolType: DeploymentRecord | null;
      ckboostCampaignType: DeploymentRecord | null;
      ckboostUserType: DeploymentRecord | null;
      ckboostProtocolLock: DeploymentRecord | null;
      ckboostFundingLock: DeploymentRecord | null;
      ckboostUserLock: DeploymentRecord | null;
      ckboostPointsUdt: DeploymentRecord | null;
      ckboostTippingType: DeploymentRecord | null;
      ckboostAchievementType: DeploymentRecord | null;
      // Add other contract types as needed
    };
    mainnet: {
      ckboostProtocolType?: DeploymentRecord | null;
      ckboostCampaignType?: DeploymentRecord | null;
      ckboostUserType?: DeploymentRecord | null;
      ckboostProtocolLock?: DeploymentRecord | null;
      ckboostFundingLock?: DeploymentRecord | null;
      ckboostUserLock?: DeploymentRecord | null;
      ckboostPointsUdt?: DeploymentRecord | null;
      ckboostTippingType?: DeploymentRecord | null;
      ckboostAchievementType?: DeploymentRecord | null;
      // Add other contract types as needed
    };
  };
  history: {
    testnet: DeploymentRecord[];
    mainnet: DeploymentRecord[];
  };
}

export class DeploymentManager {
  private data: DeploymentHistory;

  constructor() {
    // Load deployment data from JSON file
    const isolated = getIsolatedRuntime();
    this.data = isolated ? {current:isolated.current,history:{testnet:[],mainnet:[]}} as unknown as DeploymentHistory
      : deploymentsData as unknown as DeploymentHistory;
    bindCurrentDeploymentData(this.data.current);
  }

  /**
   * Get the current deployment for a specific contract on a network
   */
  getCurrentDeployment(
    network: Network,
    contractType: ContractType
  ): DeploymentRecord | null {
    if (getIsolatedRuntime() && network !== "testnet") throw new Error("Isolated QA cannot read mainnet deployments.");
    const networkData = this.data.current[network];
    return networkData[contractType] || null;
  }

  /**
   * Get the outpoint for a deployed contract
   */
  getContractOutPoint(
    network: Network,
    contractType: ContractType
  ): { txHash: ccc.Hex; index: ccc.Num } | null {
    const deployment = this.getCurrentDeployment(network, contractType);
    if (!deployment) return null;

    return {
      txHash: deployment.transactionHash,
      index: deployment.index,
    };
  }

  /**
   * Get the type script for a deployed contract
   */
  getContractTypeScript(
    network: Network,
    contractType: ContractType
  ): ccc.ScriptLike | null {
    const deployment = this.getCurrentDeployment(network, contractType);
    if (!deployment) return null;

    // Use the typeScript field if available (new format)
    if (deployment.typeScript) {
      return deployment.typeScript;
    }

    return null;
  }

  /**
   * Get the code hash for a deployed contract
   * This returns the actual code hash that should be stored in the protocol cell
   */
  getContractCodeHash(
    network: Network,
    contractType: ContractType
  ): ccc.Hex | null {
    const deployment = this.getCurrentDeployment(network, contractType);
    if (!deployment) return null;

    // Use typeHash if available (this is the actual code hash for type-id contracts)
    if (deployment.typeHash) {
      return deployment.typeHash;
    }

    return null;
  }

  /**
   * Get deployment history for a network
   */
  getHistory(network: Network): DeploymentRecord[] {
    return this.data.history[network] || [];
  }

  /**
   * Add a new deployment (this would need to be called after successful deployment)
   * Note: In a browser environment, this would need to be handled differently
   * as we can't write to files directly
   */
  addDeployment(
    network: Network,
    contractType: "ckboostProtocolType",
    deployment: DeploymentRecord
  ): void {
    if (getIsolatedRuntime()) throw new Error("The isolated QA registry is immutable. Export a new public profile instead.");
    // Update current deployment
    this.data.current[network][contractType] = deployment;

    // Add to history
    if (!this.data.history[network]) {
      this.data.history[network] = [];
    }
    this.data.history[network].push(deployment);

    // In a real implementation, you'd want to persist this
    // For now, we'll just log it
    log.info("New deployment added:", deployment);
    log.info(
      "To persist, update deployments.json with:",
      JSON.stringify(this.data, null, 2)
    );
  }

  /**
   * Get the current network based on environment
   */
  getCurrentNetwork(): Network {
    if (getIsolatedRuntime()) return "testnet";
    // You can determine this from environment variables or CKB client
    const isMainnet = process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet";
    return isMainnet ? "mainnet" : "testnet";
  }
}

// Export singleton instance
export const deploymentManager = new DeploymentManager();
