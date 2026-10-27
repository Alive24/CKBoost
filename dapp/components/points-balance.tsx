"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { Trophy, Coins, RefreshCw } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { useProtocol } from "@/lib/providers/protocol-provider";
import {
  fetchUserPointsBalance,
  formatPointsBalance,
} from "@/lib/ckb/points-balance";
import { createScopedLogger } from "ssri-ckboost";
import { cn } from "@/lib/utils";
import { StreakBonusService } from "@/lib/services/streak-bonus-service";
import { buildStreakBonusTransaction } from "@/lib/ckb/streak-bonus";
import type { BonusStreakCalculation } from "@/netlify/lib/streak-bonus";
import { UserService } from "@/lib/services/user-service";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import {
  addClaimablePoolAssetCellDep,
  emptyClaimablePointsSummary,
  queryClaimablePointsPools,
  queryClaimableUdtPoolGroups,
  type ClaimablePointsSummary,
  type ClaimableUdtPoolGroup,
} from "@/lib/ckb/claimable-pool";
import {
  buildPointsBalanceCacheKey,
  withPointsBalanceCache,
} from "@/lib/cache/query-cache";
import { registerPendingTransaction } from "@/lib/pending-transactions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  listControlledDids,
  type ControlledDid,
} from "@/lib/vellum/dids";
import { registerQuestClaimIssuance } from "@/lib/vellum/quest-claim-queue";
import { useUser } from "@/lib/providers/user-provider";
import { getDidVerificationData } from "@/lib/identity/verification-data";
import { DidIdentityLabel } from "@/components/identity/DidIdentityLabel";

const log = createScopedLogger("PointsBalance");

export function PointsBalance() {
  const { protocolCell, isAdmin } = useProtocol();
  const { currentUserData } = useUser();
  const signer = ccc.useSigner();
  const { client } = ccc.useCcc();
  const { toast } = useToast();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bonus, setBonus] = useState<BonusStreakCalculation | null>(null);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [claimablePool, setClaimablePool] =
    useState<ClaimablePointsSummary | null>(null);
  const [claimableUdtGroups, setClaimableUdtGroups] = useState<
    ClaimableUdtPoolGroup[]
  >([]);
  const [claimablePoolLoading, setClaimablePoolLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [minting, setMinting] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [didDialogOpen, setDidDialogOpen] = useState(false);
  const [didDiscoveryError, setDidDiscoveryError] = useState<string | null>(
    null,
  );
  const [didLoading, setDidLoading] = useState(false);
  const [controlledDids, setControlledDids] = useState<ControlledDid[]>([]);
  const [selectedDid, setSelectedDid] = useState("");
  const mountedRef = useRef(true);
  const preferredDid = getDidVerificationData(
    currentUserData?.verification_data?.identity_verification_data,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadBalances = useCallback(
    async (forceRefresh = false) => {
      if (!mountedRef.current) {
        return;
      }

      if (!signer || !client || !protocolCell) {
        setBalance(null);
        setBonus(null);
        setClaimablePool(null);
        setClaimableUdtGroups([]);
        setUserAddress(null);
        setIsLoading(false);
        setBonusLoading(false);
        setClaimablePoolLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setBonusLoading(true);
        setClaimablePoolLoading(true);

        const recommended = await signer.getRecommendedAddressObj();
        const userAddressString = await signer.getRecommendedAddress();
        if (!mountedRef.current) return;
        setUserAddress(userAddressString);

        const protocolTypeHash = protocolCell.cellOutput.type?.hash();
        if (!protocolTypeHash) {
          log.warn("Protocol type hash not found");
          setBalance(BigInt(0));
          setBonus(null);
          setClaimablePool(null);
          setClaimableUdtGroups([]);
          return;
        }

        const network = deploymentManager.getCurrentNetwork();
        const pointsUdtCodeHash = deploymentManager.getContractCodeHash(
          network,
          "ckboostPointsUdt",
        );
        const pointsTypeHash = pointsUdtCodeHash
          ? ccc.hexFrom(
              ccc.Script.from({
                codeHash: pointsUdtCodeHash,
                hashType: "type" as ccc.HashType,
                args: protocolTypeHash,
              }).hash(),
            )
          : null;
        const pointsCacheKey = buildPointsBalanceCacheKey({
          network,
          protocolTypeHash,
          lockScriptHash: recommended.script.hash(),
        });

        const pointsPromise = withPointsBalanceCache(
          pointsCacheKey,
          () =>
            fetchUserPointsBalance(
              client,
              recommended.script,
              protocolTypeHash,
            ),
          { refresh: forceRefresh },
        );

        const streakBonusService = new StreakBonusService();
        const streakPromise = streakBonusService
          .query({
            userAddress: userAddressString,
            refresh: forceRefresh,
          })
          .catch((bonusError) => {
            log.warn("Failed to load streak bonus information:", bonusError);
            return null;
          });
        const claimablePoolPromise = queryClaimablePointsPools({
          client,
          claimantLock: recommended.script,
          protocolTypeHash,
        }).catch((poolError) => {
          log.warn("Failed to load claimable pool information:", poolError);
          return emptyClaimablePointsSummary(recommended.script.hash());
        });
        const claimableUdtPromise = queryClaimableUdtPoolGroups({
          client,
          claimantLock: recommended.script,
          excludeTypeHashes: pointsTypeHash ? [pointsTypeHash] : [],
        }).catch((poolError) => {
          log.warn("Failed to load claimable UDT pool information:", poolError);
          return [] as ClaimableUdtPoolGroup[];
        });

        const [
          pointsResult,
          bonusResponse,
          claimablePoolResponse,
          claimableUdtResponse,
        ] = await Promise.all([
          pointsPromise,
          streakPromise,
          claimablePoolPromise,
          claimableUdtPromise,
        ]);
        if (!mountedRef.current) return;

        setBalance(pointsResult.value);
        setBonus(bonusResponse);
        setClaimablePool(claimablePoolResponse);
        setClaimableUdtGroups(claimableUdtResponse);
      } catch (error) {
        log.error("Failed to load Points balance:", error);
        if (!mountedRef.current) return;
        setBalance(BigInt(0));
        setBonus(null);
        setClaimablePool(null);
        setClaimableUdtGroups([]);
      } finally {
        if (!mountedRef.current) return;
        setIsLoading(false);
        setBonusLoading(false);
        setClaimablePoolLoading(false);
      }
    },
    [signer, client, protocolCell],
  );

  useEffect(() => {
    void loadBalances();

    const interval = setInterval(() => {
      void loadBalances();
    }, 3000000);
    return () => clearInterval(interval);
  }, [loadBalances]);

  const claimStreakBonus = useCallback(
    async (currentBonus: BonusStreakCalculation) => {
      if (!signer || !userAddress || !protocolCell) {
        throw new Error("Wallet connection required to claim streak bonus.");
      }

      const bonusService = new StreakBonusService(signer);
      const draftTx = await buildStreakBonusTransaction({
        signer,
        calculation: currentBonus,
        protocolCell,
      });

      return bonusService.claim({
        userAddress,
        tx: draftTx,
      });
    },
    [protocolCell, signer, userAddress],
  );

  const claimClaimablePool = useCallback(
    async (params: {
      claimableCells: ClaimablePointsSummary["cells"];
      protocolTypeHash: ccc.HexLike;
      pointsInputCell?: ccc.Cell;
    }) => {
      if (!signer) {
        throw new Error("Wallet connection required to claim Points.");
      }

      const network = deploymentManager.getCurrentNetwork();
      const userTypeCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostUserType",
      );
      if (!userTypeCodeHash) {
        throw new Error("User type contract not configured.");
      }

      const userService = new UserService(
        signer,
        userTypeCodeHash,
        ccc.hexFrom(params.protocolTypeHash),
      );

      return userService.claimPointsBatch(
        params.claimableCells.map((item) => item.cell),
        { pointsInputCell: params.pointsInputCell },
      );
    },
    [signer],
  );

  const claimClaimableUdtPool = useCallback(
    async (group: ClaimableUdtPoolGroup) => {
      if (!signer || !protocolCell?.cellOutput.type) {
        throw new Error("Wallet connection required to claim UDT.");
      }

      const network = deploymentManager.getCurrentNetwork();
      const userTypeCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostUserType",
      );
      if (!userTypeCodeHash) {
        throw new Error("User type contract not configured.");
      }

      const userService = new UserService(
        signer,
        userTypeCodeHash,
        ccc.hexFrom(protocolCell.cellOutput.type.hash()),
      );

      return userService.claimClaimablePoolBatch(
        group.cells.map((item) => item.cell),
        {
          addUdtCellDeps: async (tx, typeScript) => {
            await addClaimablePoolAssetCellDep(
              signer.client,
              tx,
              typeScript,
            );
          },
        },
      );
    },
    [protocolCell, signer],
  );

  const handleClaim = useCallback(async (subjectDid?: string) => {
    const bonusAmount = parseBonusAmount(bonus);
    const hasStreakClaim = Boolean(bonus?.eligible) && bonusAmount > 0n;
    const claimablePoolCells = claimablePool?.cells ?? [];
    const hasPoolClaim = claimablePoolCells.length > 0;
    const claimableUdtGroupsSnapshot = claimableUdtGroups.filter(
      (group) => group.cells.length > 0,
    );
    const hasUdtClaim = claimableUdtGroupsSnapshot.length > 0;

    if (
      !signer ||
      !userAddress ||
      !protocolCell ||
      (!hasStreakClaim && !hasPoolClaim && !hasUdtClaim)
    ) {
      return;
    }

    const protocolTypeHash = protocolCell.cellOutput.type?.hash();
    if (!protocolTypeHash) {
      toast({
        title: "Claim unavailable",
        description: "Protocol cell is missing a type script.",
        variant: "destructive",
      });
      return;
    }

    try {
      setClaiming(true);
      let streakTxHash: ccc.Hex | null = null;
      let poolTxHash: ccc.Hex | null = null;
      const udtTxHashes: ccc.Hex[] = [];
      let chainedPointsInput: ccc.Cell | undefined;

      if (hasStreakClaim && bonus) {
        const streakResult = await claimStreakBonus(bonus);
        streakTxHash = streakResult.txHash;
        chainedPointsInput = streakResult.pointsOutputCell ?? undefined;
      }

      if (hasPoolClaim) {
        try {
          if (streakTxHash && !chainedPointsInput) {
            throw new Error(
              "Streak transaction did not expose a Points output for the chained pool claim.",
            );
          }
          poolTxHash = await claimClaimablePool({
            claimableCells: claimablePoolCells,
            protocolTypeHash,
            pointsInputCell: chainedPointsInput,
          });
          if (subjectDid) {
            registerQuestClaimIssuance(poolTxHash, subjectDid);
          }
        } catch (poolError) {
          if (streakTxHash) {
            toast({
              title: "Streak bonus submitted",
              description:
                "The streak bonus transaction was sent, but the claimable pool transaction failed. Refresh after confirmation and claim the remaining Points again.",
              variant: "destructive",
            });
            await loadBalances(true);
            if (mountedRef.current) {
              setBonus(null);
            }
            return;
          }
          throw poolError;
        }
      }

      if (hasUdtClaim) {
        try {
          for (const group of claimableUdtGroupsSnapshot) {
            udtTxHashes.push(await claimClaimableUdtPool(group));
          }
        } catch (udtError) {
          if (streakTxHash || poolTxHash || udtTxHashes.length > 0) {
            toast({
              title: "Some claims submitted",
              description:
                "One or more transactions were sent, but a UDT claim failed. Refresh after confirmation and retry the remaining UDT claim.",
              variant: "destructive",
            });
            await loadBalances(true);
            return;
          }
          throw udtError;
        }
      }

      toast({
        title:
          udtTxHashes.length > 0
            ? "Claims submitted"
            : streakTxHash && poolTxHash
            ? "Points claims submitted"
            : streakTxHash
              ? "Streak bonus submitted"
              : "Claimable Points submitted",
        description: formatClaimSubmissionDescription({
          streakTxHash,
          poolTxHash,
          udtTxHashes,
          portableClaimQueued: Boolean(poolTxHash && subjectDid),
        }),
      });
      await loadBalances(true);
      if (mountedRef.current) {
        if (streakTxHash) {
          setBonus(null);
        }
        if (poolTxHash) {
          setClaimablePool(
            emptyClaimablePointsSummary(
              claimablePool?.claimantLockHash ?? undefined,
            ),
          );
        }
        if (udtTxHashes.length > 0) {
          setClaimableUdtGroups([]);
        }
      }
    } catch (error) {
      log.error("Failed to claim Points:", error);
      toast({
        title: "Unable to claim Points",
        description:
          error instanceof Error ? error.message : "Unexpected claim error.",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) {
        setClaiming(false);
      }
    }
  }, [
    bonus,
    claimablePool,
    claimableUdtGroups,
    claimClaimablePool,
    claimClaimableUdtPool,
    claimStreakBonus,
    loadBalances,
    protocolCell,
    signer,
    toast,
    userAddress,
  ]);

  const beginClaim = useCallback(async () => {
    const hasQuestPointsClaim = (claimablePool?.cells.length ?? 0) > 0;
    if (!hasQuestPointsClaim || !signer) {
      await handleClaim();
      return;
    }

    setDidLoading(true);
    setDidDiscoveryError(null);
    try {
      const address = await signer.getRecommendedAddressObj();
      const dids = await listControlledDids({
        codeHash: address.script.codeHash,
        hashType: address.script.hashType,
        args: address.script.args,
      });
      setControlledDids(dids);
      setSelectedDid(
        dids.find(({ did }) => did === preferredDid?.did)?.did ??
          dids[0]?.did ??
          "",
      );
      setDidDialogOpen(true);
    } catch (error) {
      setControlledDids([]);
      setSelectedDid("");
      setDidDiscoveryError(
        error instanceof Error
          ? error.message
          : "Controlled identities could not be loaded.",
      );
      setDidDialogOpen(true);
    } finally {
      if (mountedRef.current) setDidLoading(false);
    }
  }, [claimablePool, handleClaim, preferredDid?.did, signer]);

  const claimRewardsOnly = useCallback(() => {
    setDidDialogOpen(false);
    void handleClaim();
  }, [handleClaim]);

  const confirmDidClaim = useCallback(() => {
    if (!selectedDid) return;
    setDidDialogOpen(false);
    void handleClaim(selectedDid);
  }, [handleClaim, selectedDid]);

  const selectedIdentity = controlledDids.find(
    ({ did }) => did === selectedDid,
  );

  const handleTestMint = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    if (!signer || !userAddress || !protocolCell?.cellOutput.type) {
      toast({
        title: "Mint unavailable",
        description: "Connect an admin wallet before minting test points.",
        variant: "destructive",
      });
      return;
    }

    try {
      setMinting(true);

      const recommended = await signer.getRecommendedAddressObj();
      const userLockScript = recommended.script;
      const network = deploymentManager.getCurrentNetwork();
      const pointsCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostPointsUdt",
      );
      if (!pointsCodeHash) {
        throw new Error("Points UDT contract not configured.");
      }

      const protocolTypeHash = protocolCell.cellOutput.type.hash();
      const pointsTypeScript = ccc.Script.from({
        codeHash: pointsCodeHash,
        hashType: "type" as ccc.HashType,
        args: protocolTypeHash,
      });

      const amount = 100n;
      const pointsData = ccc.hexFrom(ccc.numToBytes(amount, 16));

      const tx = ccc.Transaction.from({});

      await tx.addOutput(
        ccc.CellOutput.from({
          capacity: ccc.numFrom(200n * 10n ** 8n),
          lock: userLockScript,
          type: pointsTypeScript,
        }),
        pointsData,
      );

      const contractNames = [
        "ckboostPointsUdt",
        "ckboostProtocolType",
        "ckboostProtocolLock",
      ] as const;
      for (const name of contractNames) {
        const outPoint = deploymentManager.getContractOutPoint(network, name);
        if (outPoint) {
          tx.addCellDeps({
            outPoint: { txHash: outPoint.txHash, index: outPoint.index },
            depType: "code",
          });
        }
      }

      tx.addCellDeps({
        outPoint: {
          txHash: protocolCell.outPoint.txHash,
          index: protocolCell.outPoint.index,
        },
        depType: "code",
      });

      await tx.completeInputsByCapacity(signer);
      for (let i = 0; i < tx.inputs.length; i += 1) {
        const inputCell = await signer.client.getCell(
          tx.inputs[i].previousOutput,
        );
        if (!inputCell) {
          throw new Error(
            "Input cell not found while preparing mint transaction.",
          );
        }
        tx.inputs[i] = ccc.CellInput.from({
          previousOutput: inputCell.outPoint,
          since: tx.inputs[i].since ?? "0x0",
          cellOutput: inputCell.cellOutput,
          outputData: inputCell.outputData,
        });
      }
      for (let i = 0; i < tx.outputs.length; i += 1) {
        const out = tx.outputs[i];
        if (out.type) {
          tx.outputs[i] = ccc.CellOutput.from(
            { lock: out.lock, type: out.type },
            tx.outputsData[i] as ccc.HexLike,
          );
        }
      }
      await tx.completeFeeBy(signer);
      const txHash = await signer.sendTransaction(tx);
      registerPendingTransaction(txHash, {
        label: "Test mint",
        context: "PointsBalance",
      });

      toast({
        title: "Test mint submitted",
        description: `Transaction ${txHash.slice(0, 10)}...${txHash.slice(
          -6,
        )} submitted.`,
      });
      await loadBalances(true);
    } catch (error) {
      log.error("Failed to mint test points:", error);
      toast({
        title: "Mint failed",
        description:
          error instanceof Error ? error.message : "Unexpected mint error.",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) {
        setMinting(false);
      }
    }
  }, [isAdmin, loadBalances, protocolCell, signer, toast, userAddress]);

  const handleRefresh = useCallback(() => {
    void loadBalances(true);
  }, [loadBalances]);

  // Don't show anything if wallet not connected
  if (!signer) {
    return null;
  }

  // Show loading state
  if ((isLoading || bonusLoading || claimablePoolLoading) && balance === null) {
    return (
      <div
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800",
        )}
      >
        <div className="animate-pulse flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" />
          <span className="text-xs">Loading...</span>
        </div>
      </div>
    );
  }

  const bonusAmount = parseBonusAmount(bonus);
  const poolAmount = claimablePool?.totalAmount ?? 0n;
  const totalClaimableAmount = bonusAmount + poolAmount;
  const hasClaimableUdt = claimableUdtGroups.some(
    (group) => group.cells.length > 0,
  );
  const claimableLabel = formatClaimableLabel(
    totalClaimableAmount,
    hasClaimableUdt,
  );

  const isBonusAvailable = Boolean(bonus?.eligible) && bonusAmount > 0n;
  const isPoolClaimAvailable = poolAmount > 0n;
  const isClaimAvailable =
    isBonusAvailable || isPoolClaimAvailable || hasClaimableUdt;

  const isDisabled =
    !isClaimAvailable ||
    claiming ||
    isLoading ||
    bonusLoading ||
    claimablePoolLoading ||
    didLoading ||
    minting ||
    !userAddress ||
    !protocolCell;

  const pointsValue = balance !== null ? formatPointsBalance(balance) : "0";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void beginClaim()}
        disabled={isDisabled}
        className={cn(
          "flex items-center gap-2 rounded-full px-3 py-1.5 h-10",
          "transition-all duration-200",
          "border-0",
          isDisabled ? "cursor-default opacity-80" : "cursor-pointer",
          claiming || didLoading ? "animate-pulse" : "",
        )}
        style={{
          backgroundColor: "#FF00FF",
        }}
      >
        {/* Icon with neon glow effect */}
        <div className="relative">
          <Coins className="w-4 h-4 text-white" strokeWidth={2} />
        </div>

        {/* Points value and text */}
        <div className="flex items-center gap-1">
          <span
            className="font-semibold text-sm"
            style={{
              color: "#00BFFF",
              fontFamily: "Pixellari, monospace",
            }}
          >
            {pointsValue}
          </span>
          <span
            className="text-sm font-medium"
            style={{
              color: "#FFFFFF",
              fontFamily: "Pixellari, monospace",
            }}
          >
            Points
          </span>
        </div>

        {claiming || didLoading ? (
          <span
            className="text-xs font-medium"
            style={{
              color: "#FFFFFF",
              textShadow: "0 0 4px rgba(255,255,255,0.6)",
            }}
          >
            {didLoading ? "Finding identity..." : "Claiming..."}
          </span>
        ) : (
          claimableLabel && (
            <span
              className="text-xs font-semibold"
              style={{
                color: "#00FF00",
                textShadow:
                  "0 0 6px rgba(0,255,0,0.8), 0 0 10px rgba(0,255,0,0.4)",
              }}
            >
              {claimableLabel}
            </span>
          )
        )}
      </button>

      {/* Refresh button with metallic/shiny effect */}
      <Button
        variant="outline"
        size="icon"
        onClick={handleRefresh}
        disabled={
          isLoading ||
          bonusLoading ||
          claimablePoolLoading ||
          claiming ||
          didLoading ||
          minting
        }
        className={cn(
          "h-10 w-10 rounded-full",
          "border-0",
          "transition-all duration-200",
          "shadow-sm",
          isLoading || bonusLoading || claimablePoolLoading
            ? ""
            : "hover:shadow-md",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        style={{
          backgroundColor: "#4a4a4a",
          boxShadow:
            "inset 0 1px 2px rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.2)",
        }}
      >
        <RefreshCw
          className={cn(
            "h-4 w-4",
            isLoading || bonusLoading || claimablePoolLoading
              ? "animate-spin"
              : "",
          )}
          style={{
            color: "#c0c0c0",
            filter:
              "drop-shadow(0 -1px 1px rgba(255,255,255,0.6)) drop-shadow(0 1px 1px rgba(0,0,0,0.3))",
          }}
          strokeWidth={2}
        />
        <span className="sr-only">Refresh points and claims</span>
      </Button>
      <Dialog open={didDialogOpen} onOpenChange={setDidDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Portable quest claim</DialogTitle>
            <DialogDescription>
              {didDiscoveryError
                ? `${didDiscoveryError} You can still claim rewards without issuing a portable claim.`
                : controlledDids.length === 0
                  ? "This wallet does not control an active did:ckb identity. You can still claim rewards without issuing a portable claim."
                  : "Choose whether to claim rewards only or also issue a public portable Claim Cell to the selected identity."}
            </DialogDescription>
          </DialogHeader>

          {controlledDids.length === 1 && (
            <div className="space-y-2">
              <Label htmlFor="quest-claim-did">Identity</Label>
              <output
                id="quest-claim-did"
                className="block rounded-md border bg-muted/50 px-3 py-2.5"
              >
                {selectedIdentity && (
                  <DidIdentityLabel identity={selectedIdentity} />
                )}
              </output>
            </div>
          )}

          {controlledDids.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="quest-claim-did">Identity</Label>
              <Select value={selectedDid} onValueChange={setSelectedDid}>
                <SelectTrigger
                  id="quest-claim-did"
                  className="h-auto min-h-14 py-2 [&>span]:line-clamp-none"
                >
                  <SelectValue
                    className="min-w-0 flex-1"
                    placeholder="Select an identity"
                  >
                    {selectedIdentity && (
                      <DidIdentityLabel identity={selectedIdentity} />
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {controlledDids.map((identity) => (
                    <SelectItem
                      key={identity.did}
                      value={identity.did}
                      className="py-2.5"
                    >
                      <DidIdentityLabel identity={identity} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter
            className={cn(
              "gap-2 sm:space-x-0",
              controlledDids.length > 0
                ? "sm:grid sm:grid-cols-2 sm:gap-2"
                : "sm:gap-2",
            )}
          >
            <DialogClose asChild>
              <Button
                variant="outline"
                className={cn(
                  controlledDids.length > 0 &&
                    "sm:col-start-1 sm:row-start-2",
                )}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant={controlledDids.length > 0 ? "secondary" : "default"}
              onClick={claimRewardsOnly}
              className={cn(
                controlledDids.length > 0 &&
                  "sm:col-start-2 sm:row-start-2",
              )}
            >
              Claim rewards only
            </Button>
            {controlledDids.length > 0 && (
              <Button
                onClick={confirmDidClaim}
                disabled={!selectedDid}
                className="sm:col-span-2 sm:row-start-1"
              >
                Claim rewards and issue portable claim
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseBonusAmount(bonus: BonusStreakCalculation | null): bigint {
  try {
    return bonus?.bonusAmount ? BigInt(bonus.bonusAmount) : 0n;
  } catch {
    return 0n;
  }
}

function formatTxHash(hash: ccc.Hex): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatClaimSubmissionDescription(params: {
  streakTxHash: ccc.Hex | null;
  poolTxHash: ccc.Hex | null;
  udtTxHashes: ccc.Hex[];
  portableClaimQueued: boolean;
}): string {
  const parts: string[] = [];
  if (params.streakTxHash) {
    parts.push(`Streak ${formatTxHash(params.streakTxHash)}`);
  }
  if (params.poolTxHash) {
    parts.push(`Pool ${formatTxHash(params.poolTxHash)}`);
  }
  for (const txHash of params.udtTxHashes) {
    parts.push(`UDT ${formatTxHash(txHash)}`);
  }
  const submitted = `${parts.join(" and ")} submitted.`;
  return params.portableClaimQueued
    ? `${submitted} The portable quest claim will follow confirmation.`
    : submitted;
}

function formatClaimableLabel(
  pointsAmount: bigint,
  hasClaimableUdt: boolean,
): string | null {
  if (pointsAmount > 0n && hasClaimableUdt) {
    return `+${formatPointsBalance(pointsAmount)} claimable · UDT`;
  }
  if (pointsAmount > 0n) {
    return `+${formatPointsBalance(pointsAmount)} claimable`;
  }
  if (hasClaimableUdt) {
    return "UDT claimable";
  }
  return null;
}
