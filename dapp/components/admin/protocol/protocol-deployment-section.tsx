"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, RotateCcw } from "lucide-react";

interface ProtocolDeploymentSectionProps {
  configStatus: string;
  error: string | null;
  isDeploying: boolean;
  isWalletConnected: boolean;
  onDeployProtocol: () => void;
  onResetChanges: () => void;
}

export function ProtocolDeploymentSection({
  configStatus,
  error,
  isDeploying,
  isWalletConnected,
  onDeployProtocol,
  onResetChanges,
}: ProtocolDeploymentSectionProps) {
  const isCorruptedOrIncompatible = error && 
    (error.includes("corrupted") || error.includes("incompatible"));
  
  const shouldShowDeployment = configStatus === "partial" || isCorruptedOrIncompatible;
  
  if (!shouldShowDeployment) {
    return null;
  }

  return (
    <Card className="border-yellow-500">
      <CardHeader>
        <CardTitle className="flex items-center text-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-5 w-5 mr-2" />
          {error && error.includes("corrupted")
            ? "Redeploy Protocol Cell"
            : "Ready to Deploy Protocol Cell"}
        </CardTitle>
        <CardDescription className="text-yellow-600 dark:text-yellow-400">
          {error && error.includes("corrupted")
            ? "The existing protocol cell data is corrupted. Review your configuration and redeploy."
            : "Review your configuration above and deploy the protocol cell when ready."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center gap-4">
        <Button
          onClick={onDeployProtocol}
          disabled={isDeploying || !isWalletConnected}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-8 py-3"
          size="lg"
        >
          {isDeploying ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              {error && error.includes("corrupted")
                ? "Redeploying Protocol Cell..."
                : "Deploying Protocol Cell..."}
            </>
          ) : (
            <>
              <Plus className="h-5 w-5 mr-2" />
              {error && error.includes("corrupted")
                ? "Redeploy Protocol Cell"
                : "Deploy Protocol Cell"}
            </>
          )}
        </Button>
        <Button
          onClick={onResetChanges}
          disabled={isDeploying}
          variant="destructive"
          size="lg"
          className="px-8 py-3"
        >
          <RotateCcw className="h-5 w-5 mr-2" />
          Reset Changes
        </Button>
      </CardContent>
    </Card>
  );
}