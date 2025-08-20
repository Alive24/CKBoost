"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { ProtocolMetrics } from "@/lib/types/protocol";
import { ProtocolData } from "ssri-ckboost/types";

type DecodedProtocolData = ReturnType<typeof ProtocolData.decode>;

interface ProtocolStatsProps {
  metrics: ProtocolMetrics | null;
  protocolData: DecodedProtocolData | null;
}

export function ProtocolStats({ metrics, protocolData }: ProtocolStatsProps) {
  if (!metrics || !protocolData) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.totalCampaigns}</div>
          <p className="text-xs text-muted-foreground">All time</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Active Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {metrics.activeCampaigns}
          </div>
          <p className="text-xs text-muted-foreground">Currently running</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Endorsers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.totalEndorsers}</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Tipping Proposals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.totalTippingProposals}</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge
            variant="default"
            className="flex items-center justify-center"
          >
            <>
              <Activity className="mr-1 h-3 w-3" />
              Active
            </>
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}