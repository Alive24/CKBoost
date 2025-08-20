"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
  title?: string;
}

export function ErrorState({ 
  error, 
  onRetry, 
  title = "Error Loading Protocol" 
}: ErrorStateProps) {
  return (
    <div className="flex justify-center items-center min-h-[400px] p-4">
      <div className="w-full max-w-md">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="space-y-4">
              <p>{error}</p>
              {onRetry && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onRetry}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}