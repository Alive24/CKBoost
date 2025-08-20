"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading protocol data..." }: LoadingStateProps) {
  return (
    <div className="flex justify-center items-center min-h-[400px]">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground text-center">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}