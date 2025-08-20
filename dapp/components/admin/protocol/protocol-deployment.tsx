"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle, FileSearch, RotateCcw } from "lucide-react";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";
import { CellLike } from "@ckb-ccc/core";

type DecodedProtocolData = ReturnType<typeof ProtocolData.decode>;
import {
  getProtocolDeploymentTemplate,
  getContractDeploymentStatus,
  deployProtocolCell,
  validateDeploymentParams,
} from "@/lib/ckb/protocol-deployment";

interface ProtocolDeploymentProps {
  protocolData: DecodedProtocolData | null;
  protocolCell: CellLike | null;
  isLoading: boolean;
  error: string | null;
  signer: ccc.Signer | undefined;
  refreshProtocolData: () => Promise<void>;
}

export function ProtocolDeployment({
  protocolData,
  protocolCell,
  isLoading,
  error,
  signer,
  refreshProtocolData,
}: ProtocolDeploymentProps) {
  const [showOutpointDialog, setShowOutpointDialog] = useState(false);
  const [outpointTxHash, setOutpointTxHash] = useState<ccc.Hex>("0x");
  const [outpointIndex, setOutpointIndex] = useState<ccc.Num>(0n);
  const [manualCellLoading, setManualCellLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);

  const deploymentTemplate = useMemo(() => getProtocolDeploymentTemplate(), []);
  const contractDeploymentStatus = useMemo(() => getContractDeploymentStatus(), []);
  // const protocolStatus = useMemo(() => getProtocolConfigStatus(protocolData), [protocolData]);

  const handleManualCellLoad = async () => {
    if (!signer) {
      setDeploymentError("Please connect wallet first");
      return;
    }

    try {
      setManualCellLoading(true);
      setDeploymentError(null);

      // Validate the outpoint format
      if (!outpointTxHash || outpointTxHash === "0x" || outpointTxHash.length !== 66) {
        throw new Error("Invalid transaction hash format. Must be 66 characters starting with 0x");
      }

      const indexNum = Number(outpointIndex);
      if (isNaN(indexNum) || indexNum < 0) {
        throw new Error("Invalid output index. Must be a non-negative number");
      }

      // Attempt to load the cell from the specified outpoint
      const outPoint = { txHash: outpointTxHash, index: ccc.numFrom(indexNum) };
      const cell = await signer.client.getCellLive(outPoint);

      if (!cell) {
        throw new Error("Cell not found at the specified outpoint. Please verify the transaction hash and index.");
      }

      console.log("Successfully loaded protocol cell from outpoint:", outPoint);
      
      // Refresh the protocol data with the new cell
      await refreshProtocolData();
      
      setShowOutpointDialog(false);
    } catch (err) {
      console.error("Failed to load protocol cell:", err);
      setDeploymentError(err instanceof Error ? err.message : "Failed to load protocol cell");
    } finally {
      setManualCellLoading(false);
    }
  };

  const handleDeployProtocol = async () => {
    if (!signer) {
      setDeploymentError("Please connect wallet first");
      return;
    }

    const capacityInput = prompt(
      "Enter the capacity for the protocol cell (minimum 500 CKB):",
      "500"
    );
    if (!capacityInput) return;

    try {
      setDeploying(true);
      setDeploymentError(null);

      const capacityNum = BigInt(parseFloat(capacityInput) * 100000000);
      if (capacityNum < 500n * 100000000n) {
        throw new Error("Minimum capacity is 500 CKB");
      }

      // Validate deployment parameters
      const validation = validateDeploymentParams(deploymentTemplate);
      if (validation.length > 0) {
        throw new Error(`Invalid deployment parameters: ${validation.join(", ")}`);
      }

      // Deploy the protocol cell
      const result = await deployProtocolCell(signer, deploymentTemplate);
      
      console.log("Protocol deployed successfully:", result);
      alert(`Protocol deployed successfully! Transaction hash: ${result.txHash}`);
      
      // Refresh the protocol data
      await refreshProtocolData();
    } catch (err) {
      console.error("Failed to deploy protocol:", err);
      setDeploymentError(err instanceof Error ? err.message : "Failed to deploy protocol");
    } finally {
      setDeploying(false);
    }
  };

  // Check if all contracts are deployed
  const allContractsDeployed = Object.values(contractDeploymentStatus).every(status => 
    typeof status === 'object' && 'deployed' in status ? status.deployed : Boolean(status)
  );

  if (error?.includes("Protocol cell not found on blockchain") && !protocolData) {
    return (
      <div className="space-y-6">
        {!allContractsDeployed && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-950">
            <CardHeader>
              <CardTitle className="flex items-center text-red-700 dark:text-red-300">
                <AlertTriangle className="mr-2" />
                Contracts Not Deployed
              </CardTitle>
              <CardDescription className="text-red-600 dark:text-red-400">
                Some required contracts are not deployed. Please deploy them first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(contractDeploymentStatus).map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{name}</span>
                    {(typeof status === 'object' && 'deployed' in status ? status.deployed : Boolean(status)) ? (
                      <Badge variant="default" className="flex items-center bg-green-600 text-white">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Deployed
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Not Deployed</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {allContractsDeployed && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <CardHeader>
              <CardTitle className="flex items-center text-yellow-700 dark:text-yellow-300">
                <AlertTriangle className="mr-2" />
                Protocol Not Deployed
              </CardTitle>
              <CardDescription className="text-yellow-600 dark:text-yellow-400">
                The protocol cell has not been deployed to the blockchain yet.
                You can either deploy a new one or load an existing one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deploymentError && (
                  <Alert variant="destructive">
                    <AlertDescription>{deploymentError}</AlertDescription>
                  </Alert>
                )}
                
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleDeployProtocol}
                    disabled={!signer || deploying}
                    className="w-full sm:w-auto"
                  >
                    {deploying ? "Deploying..." : "Deploy New Protocol"}
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-gray-300" />
                    <span className="text-sm text-gray-500">or</span>
                    <div className="flex-1 border-t border-gray-300" />
                  </div>
                  
                  <Button
                    variant="outline"
                    onClick={() => setShowOutpointDialog(true)}
                    disabled={!signer}
                    className="w-full sm:w-auto"
                  >
                    <FileSearch className="mr-2 h-4 w-4" />
                    Load Existing Protocol Cell
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manual Cell Load Dialog */}
        <Dialog open={showOutpointDialog} onOpenChange={setShowOutpointDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load Protocol Cell from Outpoint</DialogTitle>
              <DialogDescription>
                Enter the transaction hash and output index of an existing protocol cell.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction Hash</label>
                <Input
                  placeholder="0x..."
                  value={outpointTxHash}
                  onChange={(e) => setOutpointTxHash(e.target.value as ccc.Hex)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Output Index</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={outpointIndex.toString()}
                  onChange={(e) => setOutpointIndex(ccc.numFrom(parseInt(e.target.value) || 0))}
                />
              </div>
              
              {deploymentError && (
                <Alert variant="destructive">
                  <AlertDescription>{deploymentError}</AlertDescription>
                </Alert>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOutpointDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleManualCellLoad} disabled={manualCellLoading}>
                {manualCellLoading ? "Loading..." : "Load Cell"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}