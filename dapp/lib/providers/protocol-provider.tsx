"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { ccc } from "@ckb-ccc/connector-react";
import type {
  ProtocolDataLike,
  EndorserInfoLike,
  TippingDataLike,
  CampaignDataLike,
  ProtocolData,
} from "ssri-ckboost/types";
import {
  ProtocolMetrics,
  ProtocolTransaction,
  ProtocolChanges,
  FieldChange,
} from "../types/protocol";
import { ProtocolService } from "../services/protocol-service";
import { AchievementService } from "../services/achievement-service";
import { deploymentManager } from "../ckb/deployment-manager";
import { createScopedLogger } from "ssri-ckboost";
import {
  createEndorserResolver,
  type EndorserResolver,
  type ResolvedEndorser,
  normalizeEndorserLockHash,
} from "../utils/endorser-resolver";

const log = createScopedLogger("ProtocolProvider");

// Types for protocol provider
interface ProtocolContextType {
  // Protocol data
  protocolData: ReturnType<typeof ProtocolData.decode> | null;
  protocolCell: ccc.Cell | null;
  metrics: ProtocolMetrics | null;
  transactions: ProtocolTransaction[];
  isLoading: boolean;
  error: string | null;

  // Protocol operations
  refreshProtocolData: () => Promise<void>;
  updateProtocol: (form: ProtocolDataLike) => Promise<ccc.Hex>;
  addEndorser: (form: EndorserInfoLike) => Promise<void>;
  editEndorser: (form: EndorserInfoLike) => Promise<void>;
  removeEndorser: (index: number) => Promise<void>;
  calculateChanges: (formData: unknown) => ProtocolChanges;

  // Helper getters
  getEndorser: (address: string) => EndorserInfoLike | undefined;
  getTipping: (index: number) => TippingDataLike | undefined;
  resolveEndorser: (
    address: string | null | undefined
  ) => ResolvedEndorser | undefined;
  endorserResolver: EndorserResolver;

  // User-specific data
  userAddress: string | null;
  userBalance: string | null;
  isWalletConnected: boolean;
  isAdmin: boolean;
  isEndorser: boolean;

  // Signer for blockchain operations
  signer: ccc.Signer | undefined;

  // Achievement service for achievement operations
  achievementService: AchievementService | null;
}

// Create context
const ProtocolContext = createContext<ProtocolContextType | undefined>(
  undefined
);

// Provider component
export function ProtocolProvider({ children, readMode = "full" }: { children: ReactNode; readMode?: "full" | "current" }) {
  // Protocol data state
  const [protocolData, setProtocolData] = useState<ReturnType<
    typeof ProtocolData.decode
  > | null>(null);
  const [protocolCell, setProtocolCell] = useState<ccc.Cell | null>(null);
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);
  const [transactions, setTransactions] = useState<ProtocolTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [protocolService, setProtocolService] =
    useState<ProtocolService | null>(null);
  const [achievementService, setAchievementService] =
    useState<AchievementService | null>(null);

  // User state
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEndorser, setIsEndorser] = useState(false);

  // CCC hooks
  const signer = ccc.useSigner();
  const { client } = ccc.useCcc();

  // Wallet connection state
  const isWalletConnected = !!signer;
  const currentReadVersion = useRef(0);
  const currentScope = useRef({client, signer, readMode});
  currentScope.current = {client, signer, readMode};

  const endorserResolver = useMemo(
    () => createEndorserResolver(protocolData?.endorsers_whitelist ?? []),
    [protocolData?.endorsers_whitelist]
  );

  // Initialize protocol data
  useEffect(() => {
    if (readMode === "current") {
      const version = ++currentReadVersion.current;
      let cancelled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      setProtocolData(null);
      setProtocolCell(null);
      setMetrics(null);
      setTransactions([]);
      setIsLoading(true);
      setError(null);
      setProtocolService(null);
      setIsAdmin(false);
      setIsEndorser(false);
      if (!client) {
        setError("Client not initialized");
        setIsLoading(false);
        return;
      }
      // Campaign pages need the current protocol cell, not its transaction
      // history. Keep the original full-loading path below for legacy routes.
      const read = async () => {
        const service = new ProtocolService(signer || client);
        setProtocolService(service);
        const cell = await service.getProtocolCell();
        return {cell, data: await service.getProtocolData(cell)};
      };
      const timed = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error("Protocol request timed out. Please retry.")), 12_000);
      });
      Promise.race([read(), timed]).then(({cell, data}) => {
        if (!cancelled && version === currentReadVersion.current) {
          setProtocolCell(cell);
          setProtocolData(data);
        }
      }).catch(failure => {
        if (!cancelled && version === currentReadVersion.current) {
          setError(failure instanceof Error ? failure.message : "Failed to load protocol data");
        }
      }).finally(() => {
        clearTimeout(deadline);
        if (!cancelled && version === currentReadVersion.current) setIsLoading(false);
      });
      return () => {cancelled = true; clearTimeout(deadline);};
    }
    const initializeProtocol = async () => {
      // Use client for read operations, signer for write operations
      if (!client) {
        setIsLoading(false);
        setError("Client not initialized");
        setProtocolData(null);
        setMetrics(null);
        setTransactions([]);
        return;
      }

      try {
        // Create protocol service with client for read operations
        // Pass signer if available for write operations
        const protocolService = new ProtocolService(signer || client);
        setProtocolService(protocolService);

        // Create achievement service with client for read operations
        // Pass signer if available for write operations
        const network = deploymentManager.getCurrentNetwork();
        const achievementTypeCodeHash = deploymentManager.getContractCodeHash(
          network,
          "ckboostAchievementType"
        );
        if (!achievementTypeCodeHash) {
          throw new Error("Achievement type contract not deployed");
        }
        const achievementService = new AchievementService(
          client,
          achievementTypeCodeHash
        );
        setAchievementService(achievementService);

        setIsLoading(true);
        setError(null);

        const [metricsData, transactionsData, protocolCell] = await Promise.all(
          [
            protocolService.getProtocolMetrics(),
            protocolService.getProtocolTransactions(),
            protocolService.getProtocolCell(),
          ]
        );

        const data = await protocolService.getProtocolData(protocolCell);

        setProtocolCell(protocolCell);
        setProtocolData(data);
        setMetrics(metricsData);
        setTransactions(transactionsData);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load protocol data";
        setError(errorMessage);
        log.error("Failed to initialize protocol data:", err);

        // For protocol cell not found errors or corrupted data, set data to null but keep the error
        // This allows the UI to show the deployment form
        if (
          errorMessage.includes("Protocol cell not found on blockchain") ||
          errorMessage.includes("No protocol cell exists") ||
          errorMessage.includes("Protocol cell data is corrupted") ||
          errorMessage.includes("incompatible")
        ) {
          setProtocolData(null);
          setMetrics(null);
          setTransactions([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeProtocol();
  }, [signer, client, readMode]);

  // Update user info when wallet connects
  useEffect(() => {
    if (!signer) {
      setUserAddress(null);
      setUserBalance(null);
      setIsAdmin(false);
      return;
    }

    const updateUserInfo = async () => {
      try {
        // Get user address
        const addr = await signer.getRecommendedAddress();
        setUserAddress(addr);

        // Get user balance
        const balance = await signer.getBalance();
        setUserBalance(ccc.fixedPointToString(balance));

        // Check if user is admin
        if (protocolData && signer) {
          try {
            // Get the user's lock script and calculate its hash
            const userLockScript = (await signer.getRecommendedAddressObj())
              .script;
            const userLockHash = userLockScript.hash();

            log.info("Admin check:", {
              userAddress: addr,
              userLockHash,
              adminHashes: protocolData.protocol_config.admin_lock_hash_vec,
            });

            const isUserAdmin =
              protocolData.protocol_config.admin_lock_hash_vec.some(
                (adminHash: ccc.HexLike) => {
                  const hashHex =
                    typeof adminHash === "string"
                      ? adminHash
                      : ccc.hexFrom(new Uint8Array(adminHash));
                  return hashHex.toLowerCase() === userLockHash.toLowerCase();
                }
              );
            setIsAdmin(isUserAdmin);

            // Check if user is in endorser whitelist
            const isUserEndorser = endorserResolver.has(userLockHash);
            setIsEndorser(isUserEndorser);
          } catch (adminCheckErr) {
            log.error("Failed to check admin/endorser status:", adminCheckErr);
            setIsAdmin(false);
            setIsEndorser(false);
          }
        }
      } catch (err) {
        log.error("Failed to update user info:", err);
      }
    };

    updateUserInfo();
  }, [signer, protocolData, endorserResolver]);

  const updateProtocol = async (form: ProtocolDataLike): Promise<ccc.Hex> => {
    if (!protocolService) {
      throw new Error("Protocol service not initialized");
    }
    if (!signer) {
      throw new Error("Wallet connection required to update protocol");
    }
    return protocolService.updateProtocol(form);
  };

  // Protocol operations
  const refreshProtocolData = async (): Promise<void> => {
    if (readMode === "current") {
      if (currentScope.current.client !== client || currentScope.current.signer !== signer || currentScope.current.readMode !== readMode) {
        throw new Error("The wallet or network changed. Retry from the current page.");
      }
      const version = ++currentReadVersion.current;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      setIsLoading(true);
      setError(null);
      try {
        if (!client) throw new Error("Client not initialized");
        const service = new ProtocolService(signer || client);
        setProtocolService(service);
        const read = async () => {
          const cell = await service.getProtocolCell();
          return {cell, data: await service.getProtocolData(cell)};
        };
        const timed = new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Protocol request timed out. Please retry.")), 12_000);
        });
        const {cell, data} = await Promise.race([read(), timed]);
        if (version === currentReadVersion.current) {
          setProtocolCell(cell);
          setProtocolData(data);
        }
      } catch (failure) {
        if (version === currentReadVersion.current) {
          setError(failure instanceof Error ? failure.message : "Failed to refresh protocol data");
          setProtocolCell(null);
          setProtocolData(null);
        }
        throw failure;
      } finally {
        clearTimeout(deadline);
        if (version === currentReadVersion.current) setIsLoading(false);
      }
      return;
    }
    try {
      if (!protocolService) {
        throw new Error("Protocol service not initialized");
      }

      setIsLoading(true);
      setError(null);

      const [metricsData, transactionsData, protocolCell] = await Promise.all([
        protocolService.getProtocolMetrics(),
        protocolService.getProtocolTransactions(),
        protocolService.getProtocolCell(),
      ]);

      const data = await protocolService.getProtocolData(protocolCell);

      setProtocolData(data);
      setMetrics(metricsData);
      setTransactions(transactionsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh protocol data"
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const addEndorser = async (form: EndorserInfoLike): Promise<void> => {
    if (!signer) {
      throw new Error("Wallet connection required");
    }

    try {
      if (!protocolService) {
        throw new Error("Protocol service not initialized");
      }

      const currentProtocolData = protocolData;
      if (!currentProtocolData) {
        throw new Error("Protocol data not available");
      }

      const newProtocolData = {
        ...currentProtocolData,
        endorsers_whitelist: [...currentProtocolData.endorsers_whitelist, form],
      };

      setProtocolData(
        newProtocolData as ReturnType<typeof ProtocolData.decode>
      );
      // Refresh data after successful update
    } catch (err) {
      log.error("Failed to add endorser:", err);
      throw err;
    }
  };

  const editEndorser = async (form: EndorserInfoLike): Promise<void> => {
    if (!signer) {
      throw new Error("Wallet connection required");
    }

    try {
      const currentProtocolData = protocolData;
      if (!currentProtocolData) {
        throw new Error("Protocol data not available");
      }

      const newProtocolData = {
        ...currentProtocolData,
        endorsers_whitelist: currentProtocolData.endorsers_whitelist.map((e) =>
          e.endorser_lock_hash === form.endorser_lock_hash ? form : e
        ),
      };

      setProtocolData(
        newProtocolData as ReturnType<typeof ProtocolData.decode>
      );
      // Refresh data after successful update
    } catch (err) {
      log.error("Failed to edit endorser:", err);
      throw err;
    }
  };

  const removeEndorser = async (index: number): Promise<void> => {
    if (!signer) {
      throw new Error("Wallet connection required");
    }

    try {
      if (!protocolData) {
        throw new Error("Protocol data not available");
      }

      const newProtocolData = {
        ...protocolData,
        endorsers_whitelist: protocolData.endorsers_whitelist.filter(
          (e, i) => i !== index
        ),
      };

      // Refresh data after successful update
      await refreshProtocolData();

      setProtocolData(
        newProtocolData as ReturnType<typeof ProtocolData.decode>
      );
    } catch (err) {
      log.error("Failed to remove endorser:", err);
      throw err;
    }
  };

  const calculateChanges = (formData: unknown): ProtocolChanges => {
    if (!protocolData) {
      throw new Error("Protocol data not available");
    }

    const data = formData as {
      adminLockHashes: string[];
      scriptCodeHashes: {
        ckb_boost_protocol_type_code_hash: string;
        ckb_boost_protocol_lock_code_hash: string;
        ckb_boost_campaign_type_code_hash: string;
        ckb_boost_funding_lock_code_hash: string;
        ckb_boost_user_type_code_hash: string;
        ckb_boost_points_udt_type_code_hash: string;
        ckb_boost_tipping_type_code_hash: string;
        ckb_boost_achievement_type_code_hash: string;
        accepted_udt_type_scripts: ccc.ScriptLike[];
        accepted_dob_type_scripts: ccc.ScriptLike[];
      };
      tippingConfig: {
        approval_requirement_thresholds: string[];
        expiration_duration: number | bigint;
      };
      streakConfig: {
        streak_bonus_interval: ccc.NumLike;
        streak_bonus_amount: ccc.NumLike;
      };
      achievements: string[];
    };

    // Helper function to compare Script arrays
    const compareScriptArrays = (
      arr1: ccc.ScriptLike[],
      arr2: ccc.ScriptLike[]
    ): boolean => {
      if (arr1.length !== arr2.length) return false;

      return arr1.every((script1, index) => {
        const script2 = arr2[index];
        return (
          ccc.hexFrom(script1.codeHash || "") ===
            ccc.hexFrom(script2.codeHash || "") &&
          script1.hashType === script2.hashType &&
          ccc.hexFrom(script1.args || "0x") ===
            ccc.hexFrom(script2.args || "0x")
        );
      });
    };

    // Helper function to create field change
    const createFieldChange = <T,>(
      fieldPath: string,
      oldValue: T,
      newValue: T
    ): FieldChange<T> => {
      // Special handling for Script arrays
      if (
        fieldPath.includes("TypeScripts") &&
        Array.isArray(oldValue) &&
        Array.isArray(newValue)
      ) {
        return {
          fieldPath,
          oldValue,
          newValue,
          hasChanged: !compareScriptArrays(
            oldValue as unknown as ccc.ScriptLike[],
            newValue as unknown as ccc.ScriptLike[]
          ),
        };
      }

      // Custom stringify that handles BigInt
      const stringify = (value: unknown): string => {
        return JSON.stringify(value, (_, v) =>
          typeof v === "bigint" ? v.toString() : v
        );
      };

      return {
        fieldPath,
        oldValue,
        newValue,
        hasChanged: stringify(oldValue) !== stringify(newValue),
      };
    };

    // Calculate admin lock hash changes
    const currentAdmins = protocolData.protocol_config.admin_lock_hash_vec.map(
      (hash) => ccc.hexFrom(hash as ccc.BytesLike)
    );

    // Calculate script code hash changes
    const scriptCodeHashes = protocolData.protocol_config.script_code_hashes;
    const currentStreakInterval = ccc.numFrom(
      protocolData.protocol_config.streak_bonus_interval ?? 0n
    );
    const currentStreakAmount = ccc.numFrom(
      protocolData.protocol_config.streak_bonus_amount ?? 0n
    );
    const newStreakInterval = ccc.numFrom(
      data.streakConfig?.streak_bonus_interval ?? 0n
    );
    const newStreakAmount = ccc.numFrom(
      data.streakConfig?.streak_bonus_amount ?? 0n
    );

    const normalizeHashes = (list: string[]) =>
      [...list].map((hash) => hash.toLowerCase()).sort();
    const currentAchievements = normalizeHashes(
      (protocolData.protocol_config.achievement_type_hashes || []).map((hash) =>
        ccc.hexFrom(hash as ccc.BytesLike)
      )
    );
    const newAchievements = normalizeHashes(data.achievements || []);

    // Calculate changes
    const changes: ProtocolChanges = {
      protocolConfig: {
        adminLockHashes: createFieldChange(
          "protocolConfig.adminLockHashes",
          currentAdmins,
          data.adminLockHashes
        ),
      },
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostProtocolTypeCodeHash",
          scriptCodeHashes.ckb_boost_protocol_type_code_hash,
          data.scriptCodeHashes.ckb_boost_protocol_type_code_hash
        ),
        ckbBoostProtocolLockCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostProtocolLockCodeHash",
          scriptCodeHashes.ckb_boost_protocol_lock_code_hash,
          data.scriptCodeHashes.ckb_boost_protocol_lock_code_hash
        ),
        ckbBoostCampaignTypeCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostCampaignTypeCodeHash",
          scriptCodeHashes.ckb_boost_campaign_type_code_hash,
          data.scriptCodeHashes.ckb_boost_campaign_type_code_hash
        ),
        ckbBoostFundingLockCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostFundingLockCodeHash",
          scriptCodeHashes.ckb_boost_funding_lock_code_hash,
          data.scriptCodeHashes.ckb_boost_funding_lock_code_hash
        ),
        ckbBoostUserTypeCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostUserTypeCodeHash",
          scriptCodeHashes.ckb_boost_user_type_code_hash,
          data.scriptCodeHashes.ckb_boost_user_type_code_hash
        ),
        ckbBoostPointsUdtTypeCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostPointsUdtTypeCodeHash",
          scriptCodeHashes.ckb_boost_points_udt_type_code_hash,
          data.scriptCodeHashes.ckb_boost_points_udt_type_code_hash
        ),
        ckbBoostTippingTypeCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostTippingTypeCodeHash",
          scriptCodeHashes.ckb_boost_tipping_type_code_hash,
          data.scriptCodeHashes.ckb_boost_tipping_type_code_hash
        ),
        ckbBoostAchievementTypeCodeHash: createFieldChange(
          "scriptCodeHashes.ckbBoostAchievementTypeCodeHash",
          scriptCodeHashes.ckb_boost_achievement_type_code_hash,
          data.scriptCodeHashes.ckb_boost_achievement_type_code_hash
        ),
        acceptedUdtTypeScripts: createFieldChange(
          "scriptCodeHashes.acceptedUdtTypeScripts",
          scriptCodeHashes.accepted_udt_type_scripts || [],
          data.scriptCodeHashes.accepted_udt_type_scripts || []
        ),
        acceptedDobTypeScripts: createFieldChange(
          "scriptCodeHashes.acceptedDobTypeScripts",
          scriptCodeHashes.accepted_dob_type_scripts || [],
          data.scriptCodeHashes.accepted_dob_type_scripts || []
        ),
      },
      tippingConfig: {
        approvalRequirementThresholds: createFieldChange(
          "tippingConfig.approvalRequirementThresholds",
          protocolData.tipping_config.approval_requirement_thresholds.map(
            (t: ccc.NumLike) => t.toString()
          ),
          data.tippingConfig.approval_requirement_thresholds
        ),
        expirationDuration: createFieldChange(
          "tippingConfig.expirationDuration",
          Number(protocolData.tipping_config.expiration_duration),
          Number(data.tippingConfig.expiration_duration)
        ),
      },
      streakConfig: {
        streakBonusInterval: createFieldChange(
          "streakConfig.streakBonusInterval",
          currentStreakInterval.toString(),
          newStreakInterval.toString()
        ),
        streakBonusAmount: createFieldChange(
          "streakConfig.streakBonusAmount",
          currentStreakAmount.toString(),
          newStreakAmount.toString()
        ),
      },
      achievements: {
        typeHashes: createFieldChange(
          "achievements.typeHashes",
          currentAchievements,
          newAchievements
        ),
      },
      endorsers: {
        added: [],
        updated: [],
        removed: [],
      },
    };
    log.info("Changes:", changes);
    return changes;
  };

  // Helper functions
  const getEndorser = (address: string): EndorserInfoLike | undefined => {
    const normalized = normalizeEndorserLockHash(address);
    if (!normalized) {
      return undefined;
    }
    const resolved = endorserResolver.resolve(normalized);
    return resolved?.raw;
  };

  const getTipping = (index: number): TippingDataLike | undefined => {
    return protocolData?.tippings_approved?.[index] as
      | TippingDataLike
      | undefined;
  };

  const resolveEndorser = (
    address: string | null | undefined
  ): ResolvedEndorser | undefined => {
    if (!address) return undefined;
    return endorserResolver.resolve(normalizeEndorserLockHash(address));
  };

  const value: ProtocolContextType = {
    // Protocol data
    protocolData,
    protocolCell,
    metrics,
    transactions,
    isLoading,
    error,

    // Protocol operations
    refreshProtocolData,
    updateProtocol,
    addEndorser,
    editEndorser,
    removeEndorser,
    calculateChanges,

    // Helper getters
    getEndorser,
    getTipping,
    resolveEndorser,
    endorserResolver,

    // User-specific data
    userAddress,
    userBalance,
    isWalletConnected,
    isAdmin,
    isEndorser,

    // Signer for blockchain operations
    signer,

    // Achievement service for achievement operations
    achievementService,
  };

  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  );
}

// Hook to use protocol context
export function useProtocol() {
  const context = useContext(ProtocolContext);
  if (context === undefined) {
    throw new Error("useProtocol must be used within a ProtocolProvider");
  }
  return context;
}

// Helper hook for admin-specific operations
export function useProtocolAdmin() {
  const context = useProtocol();

  if (!context.isWalletConnected) {
    throw new Error("Wallet connection required for admin operations");
  }

  if (!context.isAdmin) {
    throw new Error("Admin privileges required for this operation");
  }

  return {
    updateProtocol: context.updateProtocol,
    addEndorser: context.addEndorser,
    editEndorser: context.editEndorser,
    removeEndorser: context.removeEndorser,
    refreshProtocolData: context.refreshProtocolData,
    protocolData: context.protocolData,
    metrics: context.metrics,
    isLoading: context.isLoading,
    error: context.error,
  };
}

// Helper hook for endorser-specific data
export function useEndorser(address?: string) {
  const { resolveEndorser, endorserResolver, protocolData, isLoading } =
    useProtocol();

  const resolvedEndorser = address ? resolveEndorser(address) : undefined;
  const endorser = resolvedEndorser?.raw;
  const resolvedEndorsers = endorserResolver.list();
  const allEndorsers =
    protocolData?.endorsers_whitelist?.length && resolvedEndorsers.length === 0
      ? protocolData.endorsers_whitelist
      : resolvedEndorsers.map((item) => item.raw);

  return {
    endorser,
    resolvedEndorser: resolvedEndorser ?? null,
    resolvedEndorsers,
    allEndorsers,
    isLoading,
    exists: !!endorser,
    totalEndorsers: resolvedEndorsers.length || allEndorsers.length,
  };
}

// Helper hook for tipping data
export function useTippings() {
  const { protocolData, isLoading } = useProtocol();

  const proposals = protocolData?.tippings_approved || [];
  const pendingProposals = proposals.filter(
    (p) =>
      // TODO: Implement new filter
      // !p.approval_transaction_hash && p.tipping_transaction_hash !== undefined
      true
  );
  const completedProposals = proposals.filter(
    (p) =>
      // !!p.approval_transaction_hash && p.tipping_transaction_hash !== undefined
      true
  );

  return {
    proposals,
    pendingProposals,
    completedProposals,
    isLoading,
    totalProposals: proposals.length,
    pendingCount: pendingProposals.length,
    completedCount: completedProposals.length,
  };
}
