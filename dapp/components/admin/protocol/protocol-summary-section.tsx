"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/services/protocol-service";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";

type DecodedProtocolData = ReturnType<typeof ProtocolData.decode>;

interface ProtocolSummarySectionProps {
  protocolData: DecodedProtocolData | null;
  protocolCell: ccc.Cell | null;
}

export function ProtocolSummarySection({
  protocolData,
  protocolCell,
}: ProtocolSummarySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Protocol Summary</CardTitle>
        <CardDescription>
          Overview of current protocol configuration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* High-level Protocol Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-muted-foreground">
                {protocolData
                  ? (() => {
                      const timestamp = Number(
                        protocolData.last_updated
                      );
                      // If timestamp looks like it's already in seconds, use it directly
                      // If it's too small (like default fallback), show "Not set"
                      if (timestamp < 1000000000) return "Not set";
                      // If timestamp is in milliseconds, convert to seconds
                      const finalTimestamp =
                        timestamp > 1000000000000
                          ? timestamp
                          : timestamp * 1000;
                      return formatTimestamp(finalTimestamp);
                    })()
                  : "N/A"}
              </div>
            </div>
            <div>
              <div className="font-medium">Admin Addresses</div>
              <div className="text-muted-foreground">
                {protocolData?.protocol_config.admin_lock_hash_vec
                  .length || 0}
              </div>
            </div>
            <div>
              <div className="font-medium">Active Endorsers</div>
              <div className="text-muted-foreground">
                {protocolData?.endorsers_whitelist.length || 0}
              </div>
            </div>
            <div>
              <div className="font-medium">Protocol Status</div>
              <div className="text-muted-foreground">Active</div>
            </div>
          </div>

          {/* Protocol Cell Information */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Protocol Cell Info</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Transaction Hash
                </div>
                <div className="font-mono text-xs break-all mt-1">
                  {protocolCell?.outPoint.txHash || "N/A"}
                </div>
              </div>
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Output Index
                </div>
                <div className="mt-1">
                  {protocolCell?.outPoint.index ?? "N/A"}
                </div>
              </div>
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Type Script Hash
                </div>
                <div className="font-mono text-xs break-all mt-1">
                  {protocolCell?.cellOutput.type?.codeHash || "N/A"}
                </div>
              </div>
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Type Script Args
                </div>
                <div className="font-mono text-xs break-all mt-1">
                  {protocolCell?.cellOutput.type?.args || "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Activity Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Approved Campaigns
                </div>
                <div className="mt-1">
                  {protocolData?.campaigns_approved.length || 0}{" "}
                  campaigns
                </div>
              </div>
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Tipping Proposals
                </div>
                <div className="mt-1">
                  {protocolData?.tipping_proposals.length || 0}{" "}
                  proposals
                </div>
              </div>
              <div>
                <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                  Cell Capacity
                </div>
                <div className="mt-1">
                  {protocolCell
                    ? `${(
                        Number(protocolCell.cellOutput.capacity) / 100000000
                      ).toFixed(2)} CKB`
                    : "N/A"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}