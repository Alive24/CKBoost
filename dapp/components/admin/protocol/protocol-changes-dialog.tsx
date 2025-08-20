"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save, Users } from "lucide-react";
import { ProtocolChanges as ActualProtocolChanges } from "@/lib/types/protocol";
import { EndorserInfoLike } from "ssri-ckboost/types";

interface PendingChanges {
  admins: boolean;
  scriptCodeHashes: boolean;
  tippingConfig: boolean;
  endorsers: boolean;
}

interface PendingAdminChanges {
  toAdd: string[];
  toRemove: string[];
}

interface PendingEndorserChanges {
  toAdd: EndorserInfoLike[];
  toRemove: bigint[];
}

interface ProtocolChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  protocolChanges: ActualProtocolChanges | null;
  pendingChanges: PendingChanges;
  pendingAdminChanges: PendingAdminChanges;
  pendingEndorserChanges: PendingEndorserChanges;
  onConfirm: () => void;
}

export function ProtocolChangesDialog({
  open,
  onOpenChange,
  protocolChanges,
  pendingChanges,
  pendingAdminChanges,
  pendingEndorserChanges,
  onConfirm,
}: ProtocolChangesDialogProps) {
  const hasAnyChanges = 
    pendingChanges.admins ||
    pendingChanges.scriptCodeHashes ||
    pendingChanges.tippingConfig ||
    pendingChanges.endorsers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Confirm Protocol Changes</DialogTitle>
          <DialogDescription>
            Review the changes you&apos;re about to make. All modifications will be
            applied in a single transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 max-h-96 overflow-y-auto">
          {protocolChanges && (
            <>
              {/* Admin Changes */}
              {pendingChanges.admins &&
                (pendingAdminChanges.toAdd.length > 0 ||
                  pendingAdminChanges.toRemove.length > 0) && (
                  <div className="border rounded p-4">
                    <h4 className="font-medium mb-3 flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      Admin Changes
                    </h4>
                    <div className="space-y-2 text-sm">
                      {pendingAdminChanges.toAdd.length > 0 && (
                        <div>
                          <span className="font-medium">Admins to Add:</span>
                          <div className="mt-1 space-y-1 text-green-600">
                            {pendingAdminChanges.toAdd.map(
                              (lockHash, index) => (
                                <div
                                  key={index}
                                  className="font-mono text-xs"
                                >
                                  + {lockHash}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                      {pendingAdminChanges.toRemove.length > 0 && (
                        <div>
                          <span className="font-medium">Admins to Remove:</span>
                          <div className="mt-1 space-y-1 text-red-600">
                            {pendingAdminChanges.toRemove.map((lockHash, index) => (
                              <div key={index} className="font-mono text-xs">
                                - {lockHash}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* Script Code Hashes Changes */}
              {pendingChanges.scriptCodeHashes && protocolChanges && (
                <div className="border rounded p-4">
                  <h4 className="font-medium mb-3">Script Code Hashes Changes</h4>
                  <div className="space-y-2 text-sm">
                    {Object.entries(protocolChanges.scriptCodeHashes).map(
                      ([key, change]) =>
                        change.hasChanged && (
                          <div key={key}>
                            <span className="font-medium">
                              {key
                                .replace(/([A-Z])/g, " $1")
                                .replace(/^./, (str) => str.toUpperCase())}
                              :
                            </span>
                            <div className="mt-1 space-y-1">
                              <>
                                <div className="text-red-600 font-mono text-xs">
                                  - {Array.isArray(change.oldValue) ? `[${change.oldValue.length} items]` : change.oldValue}
                                </div>
                                <div className="text-green-600 font-mono text-xs">
                                  + {Array.isArray(change.newValue) ? `[${change.newValue.length} items]` : change.newValue}
                                </div>
                              </>
                            </div>
                          </div>
                        )
                    )}
                  </div>
                </div>
              )}

              {/* Tipping Configuration Changes */}
              {pendingChanges.tippingConfig && protocolChanges && (
                <div className="border rounded p-4">
                  <h4 className="font-medium mb-3">Tipping Configuration Changes</h4>
                  <div className="space-y-2 text-sm">
                    {protocolChanges.tippingConfig.approvalRequirementThresholds.hasChanged && (
                      <div>
                        <span className="font-medium">Approval Thresholds:</span>
                        <div className="mt-1 space-y-1">
                          <div className="text-red-600">
                            - Previous: {protocolChanges.tippingConfig.approvalRequirementThresholds.oldValue.join(", ")}
                          </div>
                          <div className="text-green-600">
                            + New: {protocolChanges.tippingConfig.approvalRequirementThresholds.newValue.join(", ")}
                          </div>
                        </div>
                      </div>
                    )}
                    {protocolChanges.tippingConfig.expirationDuration.hasChanged && (
                      <div>
                        <span className="font-medium">Expiration Duration:</span>
                        <div className="mt-1 space-y-1">
                          <div className="text-red-600">
                            - Previous: {protocolChanges.tippingConfig.expirationDuration.oldValue} seconds
                          </div>
                          <div className="text-green-600">
                            + New: {protocolChanges.tippingConfig.expirationDuration.newValue} seconds
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Endorser Changes */}
              {pendingChanges.endorsers &&
                (pendingEndorserChanges.toAdd.length > 0 ||
                  pendingEndorserChanges.toRemove.length > 0) && (
                  <div className="border rounded p-4">
                    <h4 className="font-medium mb-3">Endorser Changes</h4>
                    <div className="space-y-2 text-sm">
                      {pendingEndorserChanges.toAdd.length > 0 && (
                        <div>
                          <span className="font-medium">Endorsers to Add:</span>
                          <div className="mt-1 space-y-1 text-green-600">
                            {pendingEndorserChanges.toAdd.map((endorser, index) => (
                              <div key={index}>
                                + {endorser.endorser_name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pendingEndorserChanges.toRemove.length > 0 && (
                        <div>
                          <span className="font-medium">Endorsers to Remove:</span>
                          <div className="mt-1 space-y-1 text-red-600">
                            {pendingEndorserChanges.toRemove.map((index) => (
                              <div key={index}>
                                - Endorser at index {index}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </>
          )}

          {!hasAnyChanges && (
            <div className="text-center text-muted-foreground py-8">
              No changes detected
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!hasAnyChanges}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="h-4 w-4 mr-2" />
            Confirm & Update Protocol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}