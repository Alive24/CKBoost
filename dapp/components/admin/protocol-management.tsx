/* eslint-disable react/no-unescaped-entities */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
} from "lucide-react";
import { ProtocolChanges } from "@/lib/types/protocol";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { ccc } from "@ckb-ccc/connector-react";
import {
  getProtocolConfigStatus,
  getProtocolDeploymentTemplate,
  getContractDeploymentStatus,
  deployProtocolCell,
  validateDeploymentParams,
} from "@/lib/ckb/protocol-deployment";
import {
  EndorserInfoLike,
  ProtocolDataLike,
  ScriptCodeHashesLike,
  TippingConfigLike,
} from "ssri-ckboost/types";
import { 
  ProtocolStats, 
  AdminManagement, 
  TippingConfig,
  ScriptCodeHashes,
  EndorserManagement,
  ProtocolDeploymentSection,
  ProtocolSummarySection,
  ProtocolChangesDialog
} from "./protocol";
// Note: Byte32, Uint128, Uint64 are now represented as ccc.Hex, bigint, bigint respectively

// Form types
type AddAdminForm = {
  inputMode: "address" | "script";
  adminAddress?: string;
  adminLockHash?: string;
};

// Form schemas
const addAdminSchema = z.object({
  inputMode: z.enum(["address", "script"]),
  adminAddress: z.string().optional(),
  adminLockHash: z
    .string()
    .optional(),
}).refine(
  (data) => {
    if (data.inputMode === "address") {
      return data.adminAddress && data.adminAddress.length > 0;
    } else {
      return data.adminLockHash && data.adminLockHash.match(/^0x[a-fA-F0-9]{64}$/);
    }
  },
  {
    message: "Please provide either an address or a valid lock hash",
    path: ["adminAddress"],
  }
);

const updateScriptCodeHashesSchema = z.object({
  ckb_boost_protocol_type_code_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckb_boost_protocol_lock_code_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckb_boost_campaign_type_code_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckb_boost_campaign_lock_code_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckb_boost_user_type_code_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckb_boost_points_udt_type_code_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  accepted_udt_type_code_hashes: z
    .array(z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"))
    .default([]),
  accepted_dob_type_code_hashes: z
    .array(z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"))
    .default([]),
});

const updateTippingConfigSchema = z.object({
  approval_requirement_thresholds: z
    .array(z.string().regex(/^\d+$/, "Must be a valid number"))
    .min(1, "At least one threshold required"),
  expiration_duration: z
    .number()
    .min(3600, "Minimum 1 hour")
    .max(2592000, "Maximum 30 days"),
});

const addEndorserSchema = z
  .object({
    inputMode: z.enum(["address", "script"]),
    address: z.string().optional(),
    script: z
      .object({
        codeHash: z.string().optional(),
        hashType: z.enum(["type", "data", "data1"]).optional(),
        args: z.string().optional(),
      })
      .optional(),
    endorser_name: z.string().min(1, "Name required"),
    endorser_description: z.string().min(1, "Description required"),
    website: z.string().optional(),
    social_links: z.array(z.string()).optional(),
    verified: z.number().optional(),
  })
  .refine(
    (data) => {
      if (data.inputMode === "address") {
        return data.address && data.address.length > 0;
      } else {
        return (
          data.script &&
          data.script.codeHash &&
          data.script.codeHash.match(/^0x[a-fA-F0-9]{64}$/) &&
          data.script.hashType &&
          data.script.args !== undefined &&
          data.script.args.match(/^0x[a-fA-F0-9]*$/)
        );
      }
    },
    {
      message: "Either address or valid script must be provided",
      path: ["address"],
    }
  );

export function ProtocolManagement() {
  // Use protocol provider instead of direct service calls
  const {
    protocolData,
    metrics,
    transactions,
    isLoading,
    error,
    updateProtocol,
    addEndorser,
    getTippingProposal,
    editEndorser,
    removeEndorser,
    calculateChanges,
    refreshProtocolData,
    isWalletConnected,
    protocolCell,
  } = useProtocol();

  // Get signer at the top level of the component
  const signer = ccc.useSigner();

  const adminForm = useForm<AddAdminForm>({
    resolver: zodResolver(addAdminSchema),
    defaultValues: {
      inputMode: "address",
      adminAddress: "",
      adminLockHash: "",
    },
  });

  // Get initial values from deployment template for forms
  const deploymentTemplate = useMemo(() => getProtocolDeploymentTemplate(), []);
  
  // Check deployment status for all contracts
  const contractDeploymentStatus = useMemo(() => getContractDeploymentStatus(), []);

  const scriptCodeHashesForm = useForm<ScriptCodeHashesLike>({
    resolver: zodResolver(updateScriptCodeHashesSchema),
    defaultValues: {
      ckb_boost_protocol_type_code_hash:
        deploymentTemplate.protocol_config.script_code_hashes
          .ckb_boost_protocol_type_code_hash,
      ckb_boost_protocol_lock_code_hash:
        deploymentTemplate.protocol_config.script_code_hashes
          .ckb_boost_protocol_lock_code_hash,
      ckb_boost_campaign_type_code_hash:
        deploymentTemplate.protocol_config.script_code_hashes
          .ckb_boost_campaign_type_code_hash,
      ckb_boost_campaign_lock_code_hash:
        deploymentTemplate.protocol_config.script_code_hashes
          .ckb_boost_campaign_lock_code_hash,
      ckb_boost_user_type_code_hash:
        deploymentTemplate.protocol_config.script_code_hashes
          .ckb_boost_user_type_code_hash,
      ckb_boost_points_udt_type_code_hash:
        deploymentTemplate.protocol_config.script_code_hashes
          .ckb_boost_points_udt_type_code_hash,
      accepted_udt_type_scripts: [],
      accepted_dob_type_scripts: [],
    },
  });

  const tippingConfigForm = useForm<TippingConfigLike>({
    resolver: zodResolver(updateTippingConfigSchema),
    defaultValues: {
      approval_requirement_thresholds:
        deploymentTemplate.tipping_config.approval_requirement_thresholds.length > 0
          ? deploymentTemplate.tipping_config.approval_requirement_thresholds.map(
              (t) => t.toString()
            )
          : ["100000000000", "500000000000", "1000000000000"], // Default: 1000, 5000, 10000 CKB in shannon
      expiration_duration: deploymentTemplate.tipping_config.expiration_duration || 2592000n, // Default: 30 days
    },
  });

  const endorserForm = useForm<
    EndorserInfoLike & { inputMode: "address" | "script"; address: string, script: ccc.Script }
  >({
    resolver: zodResolver(addEndorserSchema),
    defaultValues: {
      inputMode: "address",
      address: "",
      endorser_lock_hash: "",
      endorser_name: "",
      endorser_description: "",
      website: "",
      social_links: [],
      verified: 0,
      script: ccc.Script.from({
        codeHash: "",
        hashType: "type",
        args: "",
      }),
    },
  });

  // State for managing change tracking
  const [showChangesOnly, setShowChangesOnly] = useState(false);
  const [protocolChanges, setProtocolChanges] =
    useState<ProtocolChanges | null>(null);
  const [previewLockHash, setPreviewLockHash] = useState<string>("");
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);

  // State for manual outpoint loading
  const [showOutpointDialog, setShowOutpointDialog] = useState(false);
  const [outpointTxHash, setOutpointTxHash] = useState<ccc.Hex>("0x");
  const [outpointIndex, setOutpointIndex] = useState<ccc.Num>(0n);
  const [isLoadingOutpoint, setIsLoadingOutpoint] = useState(false);

  // State for protocol deployment
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<{
    txHash: string;
    args: string;
  } | null>(null);

  // Protocol cell is now obtained from useProtocol hook

  // Track the baseline values that forms were reset to, to prevent false change detection
  const [baselineValues, setBaselineValues] = useState<{
    scriptCodeHashes: ScriptCodeHashesLike | null;
    tippingConfig: TippingConfigLike | null;
  }>({
    scriptCodeHashes: null,
    tippingConfig: null,
  });

  const [pendingChanges, setPendingChanges] = useState<{
    admins: boolean;
    scriptCodeHashes: boolean;
    tippingConfig: boolean;
    endorsers: boolean;
  }>({
    admins: false,
    scriptCodeHashes: false,
    tippingConfig: false,
    endorsers: false,
  });

  // State for admin management - moved up to be available in useEffect
  const [pendingAdminChanges, setPendingAdminChanges] = useState<{
    toAdd: ccc.Hex[];
    toRemove: ccc.Hex[];
  }>({
    toAdd: [],
    toRemove: [],
  });

  // State for endorser management - moved up to be available in useEffect
  const [pendingEndorserChanges, setPendingEndorserChanges] = useState<{
    toAdd: EndorserInfoLike[];
    toRemove: ccc.Num[];
  }>({
    toAdd: [],
    toRemove: [],
  });

  // Get config status once
  const configStatus = getProtocolConfigStatus();

  // Initialize forms for deployment when no protocol cell exists
  useEffect(() => {
    const initializeForDeployment = async () => {
      if (configStatus === "partial" && signer && isWalletConnected) {
        try {
          // Get user's lock hash for admin configuration
          const address = await signer.getRecommendedAddress();
          const userLockHash = (
            await ccc.Address.fromString(address, signer.client)
          ).script.hash();

          // Set initial admin as the current user
          setPendingAdminChanges({
            toAdd: [userLockHash],
            toRemove: [],
          });
          setPendingChanges((prev) => ({ ...prev, admins: true }));

          // Set baseline values to prevent false change detection
          // Forms already have the correct default values from deploymentTemplate
          setBaselineValues({
            scriptCodeHashes: {
              ckb_boost_protocol_type_code_hash:
                deploymentTemplate.protocol_config.script_code_hashes
                  .ckb_boost_protocol_type_code_hash,
              ckb_boost_protocol_lock_code_hash:
                deploymentTemplate.protocol_config.script_code_hashes
                  .ckb_boost_protocol_lock_code_hash,
              ckb_boost_campaign_type_code_hash:
                deploymentTemplate.protocol_config.script_code_hashes
                  .ckb_boost_campaign_type_code_hash,
              ckb_boost_campaign_lock_code_hash:
                deploymentTemplate.protocol_config.script_code_hashes
                  .ckb_boost_campaign_lock_code_hash,
              ckb_boost_user_type_code_hash:
                deploymentTemplate.protocol_config.script_code_hashes
                  .ckb_boost_user_type_code_hash,
              ckb_boost_points_udt_type_code_hash:
                deploymentTemplate.protocol_config.script_code_hashes
                  .ckb_boost_points_udt_type_code_hash,
              accepted_udt_type_scripts: deploymentTemplate.protocol_config.script_code_hashes.accepted_udt_type_scripts || [],
              accepted_dob_type_scripts: deploymentTemplate.protocol_config.script_code_hashes.accepted_dob_type_scripts || [],
            },
            tippingConfig: {
              approval_requirement_thresholds:
                deploymentTemplate.tipping_config.approval_requirement_thresholds.map(
                  (t) => ccc.numFrom(t)
                ),
              expiration_duration: ccc.numFrom(
                deploymentTemplate.tipping_config.expiration_duration
              ),
            },
          });
        } catch (error) {
          console.error("Failed to initialize deployment forms:", error);
        }
      }
    };

    if (configStatus === "partial") {
      initializeForDeployment();
    }
  }, [configStatus, signer, isWalletConnected, deploymentTemplate]);

  // Update form defaults when protocol data changes (only for existing protocol)
  useEffect(() => {
    if (protocolData && configStatus === "complete") {
      // Don't reset admin changes - they're managed separately now

      const scriptHashesValues: ScriptCodeHashesLike = {
        ckb_boost_protocol_type_code_hash:
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_protocol_type_code_hash,
        ckb_boost_protocol_lock_code_hash:
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_protocol_lock_code_hash,
        ckb_boost_campaign_type_code_hash:
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_campaign_type_code_hash,
        ckb_boost_campaign_lock_code_hash:
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_campaign_lock_code_hash,
        ckb_boost_user_type_code_hash:
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_user_type_code_hash,
        ckb_boost_points_udt_type_code_hash:
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_points_udt_type_code_hash,
        accepted_udt_type_scripts: [],
        accepted_dob_type_scripts: [],
      };

      const tippingValues: TippingConfigLike = {
        approval_requirement_thresholds:
          protocolData.tipping_config.approval_requirement_thresholds,
        expiration_duration: protocolData.tipping_config.expiration_duration,
      };

      scriptCodeHashesForm.reset({
        ...scriptHashesValues,
        accepted_udt_type_scripts: protocolData.protocol_config.script_code_hashes.accepted_udt_type_scripts || [],
        accepted_dob_type_scripts: protocolData.protocol_config.script_code_hashes.accepted_dob_type_scripts || [],
      });
      tippingConfigForm.reset(tippingValues);

      // Set baseline values to prevent false change detection
      setBaselineValues({
        scriptCodeHashes: {
          ...scriptHashesValues,
          accepted_udt_type_scripts: protocolData.protocol_config.script_code_hashes.accepted_udt_type_scripts || [],
          accepted_dob_type_scripts: protocolData.protocol_config.script_code_hashes.accepted_dob_type_scripts || [],
        },
        tippingConfig: tippingValues,
      });
    }
  }, [protocolData, configStatus, scriptCodeHashesForm, tippingConfigForm]);

  // Watch form changes to track modifications
  const scriptCodeHashesValues = scriptCodeHashesForm.watch();
  const tippingConfigValues = tippingConfigForm.watch();

  // Watch endorser form for preview lock hash computation
  const watchedInputMode = endorserForm.watch("inputMode");
  const watchedLockHash = endorserForm.watch("endorser_lock_hash");
  const watchedAddress = endorserForm.watch("address");

  // Calculate the final admin list based on current state and pending changes
  const finalAdminLockHashes = useMemo(() => {
    // For deployment, start with empty array if no protocol data
    if (!protocolData && configStatus === "partial") {
      return pendingAdminChanges.toAdd;
    }

    const currentAdmins =
      protocolData?.protocol_config.admin_lock_hash_vec.map((hash) =>
        ccc.hexFrom(hash as ccc.BytesLike)
      ) || [];

    // Start with current admins
    let result = [...currentAdmins];

    // Remove admins marked for removal
    result = result.filter(
      (val, _index) => !pendingAdminChanges.toRemove.includes(val as ccc.Hex)
    );

    // Add new admins
    result.push(...(pendingAdminChanges.toAdd as ccc.Hex[]));

    return result;
  }, [protocolData, pendingAdminChanges, configStatus]);

  // Memoize the form data to prevent unnecessary recalculations
  const formData = useMemo(
    () => ({
      adminLockHashes: finalAdminLockHashes,
      scriptCodeHashes: scriptCodeHashesValues,
      tippingConfig: tippingConfigValues,
    }),
    [finalAdminLockHashes, scriptCodeHashesValues, tippingConfigValues]
  );

  // Calculate changes with proper dependency management
  useEffect(() => {
    // Helper function to compare Script arrays - defined inside useEffect to avoid dependency issues
    const compareScriptArrays = (arr1: ccc.ScriptLike[], arr2: ccc.ScriptLike[], fieldName?: string): boolean => {
      // Handle null/undefined arrays
      if (!arr1 && !arr2) return true;
      if (!arr1 || !arr2) return false;
      
      // Handle empty arrays
      if (arr1.length === 0 && arr2.length === 0) return true;
      
      if (arr1.length !== arr2.length) {
        console.log(`Script array length mismatch for ${fieldName}:`, arr1.length, 'vs', arr2.length);
        return false;
      }
      
      return arr1.every((script1, index) => {
        const script2 = arr2[index];
        
        // Handle the codeHash comparison - treat empty string as a special case
        const codeHash1 = script1.codeHash === "" ? "" : ccc.hexFrom(script1.codeHash || "");
        const codeHash2 = script2.codeHash === "" ? "" : ccc.hexFrom(script2.codeHash || "");
        const codeHashMatch = codeHash1 === codeHash2;
        
        const hashTypeMatch = script1.hashType === script2.hashType;
        
        // Handle args comparison
        const args1 = ccc.hexFrom(script1.args || "0x");
        const args2 = ccc.hexFrom(script2.args || "0x");
        const argsMatch = args1 === args2;
        
        if (!codeHashMatch || !hashTypeMatch || !argsMatch) {
          console.log(`Script mismatch at index ${index} for ${fieldName}:`, {
            codeHash: [codeHash1, codeHash2],
            hashType: [script1.hashType, script2.hashType],
            args: [args1, args2]
          });
        }
        
        return codeHashMatch && hashTypeMatch && argsMatch;
      });
    };
    
    if (
      !protocolData ||
      !baselineValues.scriptCodeHashes ||
      !baselineValues.tippingConfig
    )
      return;

    // Debug logging
    console.log('Comparing script values:', {
      current_udt: scriptCodeHashesValues.accepted_udt_type_scripts,
      baseline_udt: baselineValues.scriptCodeHashes.accepted_udt_type_scripts,
      current_dob: scriptCodeHashesValues.accepted_dob_type_scripts,
      baseline_dob: baselineValues.scriptCodeHashes.accepted_dob_type_scripts,
    });

    // Check if current values match baseline values (no changes)
    const scriptHashesEqual =
      scriptCodeHashesValues.ckb_boost_protocol_type_code_hash === baselineValues.scriptCodeHashes.ckb_boost_protocol_type_code_hash &&
      scriptCodeHashesValues.ckb_boost_protocol_lock_code_hash === baselineValues.scriptCodeHashes.ckb_boost_protocol_lock_code_hash &&
      scriptCodeHashesValues.ckb_boost_campaign_type_code_hash === baselineValues.scriptCodeHashes.ckb_boost_campaign_type_code_hash &&
      scriptCodeHashesValues.ckb_boost_campaign_lock_code_hash === baselineValues.scriptCodeHashes.ckb_boost_campaign_lock_code_hash &&
      scriptCodeHashesValues.ckb_boost_user_type_code_hash === baselineValues.scriptCodeHashes.ckb_boost_user_type_code_hash &&
      scriptCodeHashesValues.ckb_boost_points_udt_type_code_hash === baselineValues.scriptCodeHashes.ckb_boost_points_udt_type_code_hash &&
      compareScriptArrays(scriptCodeHashesValues.accepted_udt_type_scripts, baselineValues.scriptCodeHashes.accepted_udt_type_scripts, 'accepted_udt_type_scripts') &&
      compareScriptArrays(scriptCodeHashesValues.accepted_dob_type_scripts, baselineValues.scriptCodeHashes.accepted_dob_type_scripts, 'accepted_dob_type_scripts');
    
    const tippingEqual =
      JSON.stringify(tippingConfigValues, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      ) ===
      JSON.stringify(baselineValues.tippingConfig, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      );

    if (scriptHashesEqual && tippingEqual) {
      // No changes detected, clear pending changes
      setPendingChanges((prev) => ({
        ...prev,
        scriptCodeHashes: false,
        tippingConfig: false,
      }));
      setProtocolChanges(null);
      return;
    }

    // Use a flag to prevent setting state if component unmounted
    let isActive = true;

    // Add a small delay to debounce rapid changes
    const timeoutId = setTimeout(() => {
      if (!isActive) return;

      try {
        const currentFormData = {
          adminLockHashes: finalAdminLockHashes,
          scriptCodeHashes: scriptCodeHashesValues,
          tippingConfig: tippingConfigValues,
        };

        if (
          !currentFormData.adminLockHashes ||
          !currentFormData.scriptCodeHashes ||
          !currentFormData.tippingConfig
        ) {
          return;
        }

        console.log("Calculating changes with data:", {
          protocolData: !!protocolData,
          currentFormData,
        });

        const changes = calculateChanges(currentFormData);

        if (isActive) {
          console.log("Changes calculated successfully:", changes);
          setProtocolChanges(changes);

          // Update pending changes indicators
          setPendingChanges((prev) => ({
            ...prev,
            admins: changes.protocolConfig.adminLockHashes.hasChanged,
            scriptCodeHashes: Object.values(changes.scriptCodeHashes).some(
              (change) => change.hasChanged
            ),
            tippingConfig: Object.values(changes.tippingConfig).some(
              (change) => change.hasChanged
            ),
          }));
        }
      } catch (error) {
        if (isActive) {
          console.error("Failed to calculate changes:", error);
          // Reset changes on error
          setProtocolChanges(null);
          setPendingChanges({
            admins: false,
            scriptCodeHashes: false,
            tippingConfig: false,
            endorsers: false,
          });
        }
      }
    }, 100); // 100ms debounce

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [
    protocolData,
    // Use JSON.stringify with a replacer to handle BigInt values
    JSON.stringify(finalAdminLockHashes, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    JSON.stringify(scriptCodeHashesValues, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    JSON.stringify(tippingConfigValues, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    JSON.stringify(baselineValues, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    calculateChanges,
  ]);

  // Effect to compute preview lock hash when address changes
  useEffect(() => {
    if (watchedInputMode === "address" && watchedAddress.trim() !== "") {
      computeLockHashFromAddress(watchedAddress)
        .then((hash) => setPreviewLockHash(hash))
        .catch((error) => {
          console.error("Failed to compute lock hash from address:", error);
          setPreviewLockHash("Invalid address format");
        });
    } else {
      setPreviewLockHash("");
    }
  }, [watchedInputMode, watchedAddress]);

  // Protocol cell is now obtained from useProtocol hook, no need to fetch separately

  const onAddAdmin = async (
    data: AddAdminForm & { inputMode: "address" | "script" }
  ) => {
    try {
      let lockHash: string;

      if (data.inputMode === "address" && data.adminAddress) {
        // Convert address to lock hash
        const address = await ccc.Address.fromString(
          data.adminAddress,
          signer!.client
        );
        lockHash = address.script.hash();
      } else if (data.inputMode === "script" && data.adminLockHash) {
        lockHash = data.adminLockHash;
      } else {
        throw new Error("Please provide either an address or lock hash");
      }

      // Check if admin already exists or is pending
      const isDuplicate =
        protocolData?.protocol_config.admin_lock_hash_vec.some(
          (hash: ccc.BytesLike) => ccc.hexFrom(hash) === lockHash
        ) || pendingAdminChanges.toAdd.includes(lockHash as ccc.Hex);

      if (isDuplicate) {
        throw new Error("This admin already exists or is pending addition");
      }

      // Add to pending changes
      setPendingAdminChanges((prev) => ({
        ...prev,
        toAdd: [...prev.toAdd, lockHash as ccc.Hex],
      }));

      // Update pending changes indicator
      setPendingChanges((prev) => ({ ...prev, admins: true }));

      // Reset form after state update
      adminForm.reset({
        inputMode: "address",
        adminAddress: "",
        adminLockHash: "",
      });
    } catch (error) {
      console.error("Failed to add admin:", error);
      alert("Failed to add admin: " + (error as Error).message);
    }
  };

  const onRemoveAdmin = (index: number) => {
    // Add to removal list
    setPendingAdminChanges((prev) => ({
      ...prev,
      toRemove: [...prev.toRemove, `0x${index.toString(16)}` as `0x${string}`],
    }));

    // Update pending changes indicator
    setPendingChanges((prev) => ({ ...prev, admins: true }));
  };

  const onAddEndorser = async (
    data: EndorserInfoLike & {
      inputMode: "address" | "script";
      address?: string;
      script?: ccc.ScriptLike;
    }
  ) => {
    try {
      let lockHash: string;
      let userLockScript: ccc.Script;

      if (data.inputMode === "address" && data.address) {
        // Compute lock hash from address
        userLockScript = ccc.Script.from(
          (await ccc.Address.fromString(data.address, signer!.client)).script
        );
        // For address mode, we need to derive the lock script from the address
        // This is a simplified approach - in production you'd need proper address parsing
        lockHash = userLockScript.hash();
      } else if (data.inputMode === "script" && data.script) {
        // Compute lock hash from script
        const userLockScript = ccc.Script.from(data.script);
        lockHash = userLockScript.hash();
      } else {
        throw new Error("Invalid endorser input");
      }

      // Add to pending changes instead of sending transaction
      const newEndorser = {
        endorser_name: data.endorser_name,
        endorser_description: data.endorser_description,
        endorser_lock_hash: lockHash as ccc.Hex,
        website: data.website || "",
        social_links: data.social_links || [],
        verified: data.verified || 0,
      };
      
      setPendingEndorserChanges((prev) => {
        const updated = {
          ...prev,
          toAdd: [...prev.toAdd, newEndorser],
        };
        return updated;
      });

      // Update pending changes indicator
      setPendingChanges((prev) => ({ ...prev, endorsers: true }));

      endorserForm.reset();
    } catch (error) {
      console.error("Failed to add endorser:", error);
      alert("Failed to add endorser: " + (error as Error).message);
    }
  };

  const onRemoveEndorser = (index: number) => {
    if (!confirm("Are you sure you want to remove this endorser?")) {
      return;
    }

    // Add to pending removals instead of sending transaction
    setPendingEndorserChanges((prev) => ({
      ...prev,
      toRemove: [...prev.toRemove, BigInt(index)],
    }));

    // Update pending changes indicator
    setPendingChanges((prev) => ({ ...prev, endorsers: true }));
  };

  const onUpdate = () => {
    console.log("onUpdate called", {
      isWalletConnected,
      protocolChanges: !!protocolChanges,
      pendingChanges,
      protocolData: !!protocolData,
    });

    if (!isWalletConnected) {
      alert("Please connect your wallet first");
      return;
    }

    if (!protocolData) {
      console.error("No protocol data available");
      alert("Protocol data not loaded. Please wait or refresh.");
      return;
    }

    const hasChanges =
      pendingChanges.admins ||
      pendingChanges.scriptCodeHashes ||
      pendingChanges.tippingConfig ||
      pendingChanges.endorsers;

    if (!hasChanges) {
      console.warn("No pending changes detected");
      alert("No changes to update");
      return;
    }

    // For endorser-only changes, protocolChanges might be null, which is OK
    const hasFormChanges =
      pendingChanges.admins ||
      pendingChanges.scriptCodeHashes ||
      pendingChanges.tippingConfig;
    if (hasFormChanges && !protocolChanges) {
      console.error("No protocol changes available for form modifications");
      alert("Unable to process form changes. Please try again.");
      return;
    }

    console.log("Opening confirmation dialog");
    setShowConfirmationDialog(true);
  };

  const confirmUpdate = async () => {
    try {
      if (!protocolData) {
        throw new Error("Protocol data not loaded");
      }

      const updatedData = {
        ...protocolData,
        last_updated: BigInt(Date.now()),
        // Override with properly formatted changes
      } as unknown as ProtocolDataLike;

      // Handle admin changes
      if (pendingChanges.admins && finalAdminLockHashes.length > 0) {
        updatedData.protocol_config.admin_lock_hash_vec = finalAdminLockHashes;
      }

      // Handle script code hashes changes
      if (pendingChanges.scriptCodeHashes && formData.scriptCodeHashes) {
        updatedData.protocol_config.script_code_hashes = formData.scriptCodeHashes;
      }

      // Handle tipping config changes
      if (pendingChanges.tippingConfig && formData.tippingConfig) {
        updatedData.tipping_config = formData.tippingConfig;
      }

      // Handle endorser changes
      if (pendingChanges.endorsers) {
        // Start with current endorsers
        let updatedEndorsers = [...(protocolData.endorsers_whitelist || [])] as unknown as EndorserInfoLike[];
        
        // Remove endorsers
        if (pendingEndorserChanges.toRemove.length > 0) {
          pendingEndorserChanges.toRemove.forEach((index) => {
            updatedEndorsers.splice(Number(index), 1);
          });
        }
        
        // Add new endorsers
        if (pendingEndorserChanges.toAdd.length > 0) {
          updatedEndorsers = [...updatedEndorsers, ...pendingEndorserChanges.toAdd];
        }
        updatedData.endorsers_whitelist = updatedEndorsers;
      }

      // Use the provider's update method with the complete ProtocolData
      const txHash = await updateProtocol(updatedData);
      console.log("Protocol updated:", txHash);
      alert(`Protocol updated successfully! Transaction: ${txHash}`);

      // Reset pending changes and close dialog
      setPendingChanges({
        admins: false,
        scriptCodeHashes: false,
        tippingConfig: false,
        endorsers: false,
      });
      setPendingEndorserChanges({
        toAdd: [],
        toRemove: [],
      });
      setShowConfirmationDialog(false);
    } catch (error) {
      console.error("Failed to batch update protocol:", error);
      alert("Failed to update protocol: " + (error as Error).message);
      setShowConfirmationDialog(false);
    }
  };

  const toggleChangesView = () => {
    setShowChangesOnly(!showChangesOnly);
  };

  // Helper function to check if a section should be shown
  const shouldShowSection = (hasChanges: boolean): boolean => {
    return !showChangesOnly || hasChanges;
  };

  const resetAllChanges = () => {
    if (
      !confirm(
        "Are you sure you want to reset all changes? This will discard all modifications."
      )
    ) {
      return;
    }

    try {
      // Clear baseline values to allow proper re-initialization
      setBaselineValues({
        scriptCodeHashes: null,
        tippingConfig: null,
      });

      // Reset all pending change states
      setPendingChanges({
        admins: false,
        scriptCodeHashes: false,
        tippingConfig: false,
        endorsers: false,
      });

      // Reset admin changes
      setPendingAdminChanges({
        toAdd: [],
        toRemove: [],
      });

      // Reset endorser changes
      setPendingEndorserChanges({
        toAdd: [],
        toRemove: [],
      });

      // Reset form values to original state
      if (protocolData) {
        // For existing protocol data, reset to current protocol values
        scriptCodeHashesForm.reset({
          ckb_boost_protocol_type_code_hash:
            protocolData.protocol_config.script_code_hashes
              .ckb_boost_protocol_type_code_hash,
          ckb_boost_protocol_lock_code_hash:
            protocolData.protocol_config.script_code_hashes
              .ckb_boost_protocol_lock_code_hash,
          ckb_boost_campaign_type_code_hash:
            protocolData.protocol_config.script_code_hashes
              .ckb_boost_campaign_type_code_hash,
          ckb_boost_campaign_lock_code_hash:
            protocolData.protocol_config.script_code_hashes
              .ckb_boost_campaign_lock_code_hash,
          ckb_boost_user_type_code_hash:
            protocolData.protocol_config.script_code_hashes
              .ckb_boost_user_type_code_hash,
          ckb_boost_points_udt_type_code_hash:
            protocolData.protocol_config.script_code_hashes
              .ckb_boost_points_udt_type_code_hash,
          accepted_udt_type_scripts:
            protocolData.protocol_config.script_code_hashes
              .accepted_udt_type_scripts || [],
          accepted_dob_type_scripts:
            protocolData.protocol_config.script_code_hashes
              .accepted_dob_type_scripts || [],
        });

        tippingConfigForm.reset({
          approval_requirement_thresholds:
            protocolData.tipping_config.approval_requirement_thresholds,
          expiration_duration: protocolData.tipping_config.expiration_duration,
        });
      } else if (configStatus === "partial") {
        // For deployment mode, reset to template defaults but don't mark as changed
        scriptCodeHashesForm.reset({
          ckb_boost_protocol_type_code_hash:
            deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash,
          ckb_boost_protocol_lock_code_hash:
            deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash,
          ckb_boost_campaign_type_code_hash:
            deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash,
          ckb_boost_campaign_lock_code_hash:
            deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash,
          ckb_boost_user_type_code_hash:
            deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash,
          ckb_boost_points_udt_type_code_hash:
            deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_points_udt_type_code_hash,
          accepted_udt_type_scripts: [],
          accepted_dob_type_scripts: [],
        });

        tippingConfigForm.reset({
          approval_requirement_thresholds:
            deploymentTemplate.tipping_config.approval_requirement_thresholds,
          expiration_duration:
            deploymentTemplate.tipping_config.expiration_duration,
        });
      }

      // Reset admin form
      adminForm.reset({
        inputMode: "address",
        adminAddress: "",
        adminLockHash: "",
      });

      // Reset endorser form
      endorserForm.reset();

      // Clear protocol changes
      setProtocolChanges(null);

      // Re-initialization will happen automatically via the useEffect hooks
      // when baseline values are cleared and forms are reset

      console.log("All changes have been reset");
    } catch (error) {
      console.error("Failed to reset changes:", error);
      alert("Failed to reset changes: " + (error as Error).message);
    }
  };

  // const handleLoadByOutpoint = async () => {
  //   if (!outpointTxHash || !outpointIndex) {
  //     alert("Please enter both transaction hash and index");
  //     return;
  //   }

  //   setIsLoadingOutpoint(true);
  //   try {
  //     await protocolService.loadProtocolDataByOutPoint({
  //       txHash: outpointTxHash.startsWith("0x")
  //         ? (outpointTxHash as ccc.Hex)
  //         : `0x${outpointTxHash}`,
  //       index: BigInt(outpointIndex),
  //     });
  //     setShowOutpointDialog(false);
  //     setOutpointTxHash("0x");
  //     setOutpointIndex(0n);
  //     alert("Protocol data loaded successfully from the specified outpoint");
  //   } catch (error) {
  //     console.error("Failed to load protocol data by outpoint:", error);
  //     alert("Failed to load protocol data: " + (error as Error).message);
  //   } finally {
  //     setIsLoadingOutpoint(false);
  //   }
  // };

  // Helper function to render change indicator badge
  const ChangeIndicator = ({ hasChanged }: { hasChanged: boolean }) => {
    if (!hasChanged) return null;
    return (
      <Badge variant="destructive" className="ml-2 text-xs">
        Modified
      </Badge>
    );
  };

  // Helper function to compute lock hash from script using CCC
  const computeLockHashFromScript = (script: ccc.Script | undefined): string => {
    if (!script || !script.codeHash || !script.args) {
      return "Invalid script - missing required fields";
    }

    try {
      // Create CCC Script object and compute hash
      const cccScript = ccc.Script.from({
        codeHash: script.codeHash,
        hashType: script.hashType,
        args: script.args,
      });
      return cccScript.hash();
    } catch (error) {
      console.error("Failed to compute script hash:", error);
      return "Invalid script format";
    }
  };

  // Helper function to compute lock hash from address using CCC
  const computeLockHashFromAddress = async (
    address: string
  ): Promise<string> => {
    if (!address || address.trim() === "") {
      return "Enter an address to preview lock hash";
    }

    try {
      if (!signer) return "Connect wallet to preview lock hash";
      const addr = await ccc.Address.fromString(address, signer.client);
      const script = addr.script;
      return script.hash();
    } catch (error) {
      console.error("Failed to parse address:", error);
      return "Invalid address format";
    }
  };

  // Helper function to preview lock hash based on input mode
  const getPreviewLockHash = (): string => {
    const inputMode = endorserForm.watch("inputMode");
    const address = endorserForm.watch("address");
    const script = endorserForm.watch("script");

    if (inputMode === "address") {
      if (!address || address.trim() === "") {
        return "Enter an address to preview lock hash";
      }
      // We'll use a state variable to store the computed hash from address
      return previewLockHash || "Computing lock hash...";
    } else {
      return computeLockHashFromScript(script);
    }
  };

  // Protocol deployment handler
  const handleDeployProtocol = async () => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first");
      return;
    }

    if (!signer) {
      alert("No signer available. Please connect your wallet.");
      return;
    }

    try {
      setIsDeploying(true);

      // Collect form data
      const deploymentParams: ProtocolDataLike = {
        campaigns_approved: [],
        tipping_proposals: [],
        last_updated: ccc.numFrom(Date.now()),
        tipping_config: tippingConfigValues,
        endorsers_whitelist: pendingEndorserChanges.toAdd.map((endorser) => ({
          endorser_lock_hash: endorser.endorser_lock_hash,
          endorser_name: endorser.endorser_name,
          endorser_description: endorser.endorser_description,
          website: "",
          social_links: [],
          verified: 0n,
        })),
        protocol_config: {
          admin_lock_hash_vec: finalAdminLockHashes || [],
          script_code_hashes: scriptCodeHashesValues,
        },
      };

      // Validate deployment parameters
      const validationErrors = validateDeploymentParams(deploymentParams);
      if (validationErrors.length > 0) {
        throw new Error("Validation failed:\n" + validationErrors.join("\n"));
      }

      // Deploy the protocol cell
      const result = await deployProtocolCell(signer, deploymentParams);

      // Store deployment result
      setDeploymentResult({
        txHash: result.txHash,
        args: result.protocolTypeScript.args,
      });

      alert(
        `Protocol cell deployed successfully!\n\nTransaction: ${result.txHash}\n\nIMPORTANT: Copy the protocol cell args and update your .env.local file:\nNEXT_PUBLIC_PROTOCOL_TYPE_ARGS=${result.protocolTypeScript.args}`
      );
    } catch (error) {
      console.error("Failed to deploy protocol:", error);
      alert("Failed to deploy protocol: " + (error as Error).message);
    } finally {
      setIsDeploying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Handle "Protocol cell not found" error specially - allow UI to continue
  // so that deployment form can be shown
  const isProtocolNotFoundError =
    error?.includes("Protocol cell not found on blockchain") ||
    error?.includes("No protocol cell exists on the blockchain");

  // Only show error page for non-protocol-not-found errors
  if (error && !isProtocolNotFoundError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold">
              Failed to Load Protocol Data
            </h3>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={refreshProtocolData} className="mt-2">
              <Activity className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check wallet connection first
  if (!isWalletConnected) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-orange-600 dark:text-orange-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">
              Wallet Connection Required
            </h3>
            <p className="text-muted-foreground">
              Please connect your wallet to access Protocol Management
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Protocol Management</h2>
          <p className="text-muted-foreground">
            Manage CKB protocol configuration and data
          </p>
          {(pendingChanges.admins ||
            pendingChanges.scriptCodeHashes ||
            pendingChanges.tippingConfig ||
            pendingChanges.endorsers) && (
            <p className="text-orange-600 text-sm font-medium mt-1">
              ⚠️ You have unsaved changes
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {configStatus === "complete" && (
            <>
              <Button onClick={toggleChangesView} variant="outline" size="sm">
                {showChangesOnly ? (
                  <Eye className="h-4 w-4 mr-2" />
                ) : (
                  <EyeOff className="h-4 w-4 mr-2" />
                )}
                {showChangesOnly ? "Show All" : "Show Changes Only"}
              </Button>
              <Button
                onClick={resetAllChanges}
                variant="outline"
                size="sm"
                disabled={
                  !pendingChanges.admins &&
                  !pendingChanges.scriptCodeHashes &&
                  !pendingChanges.tippingConfig &&
                  !pendingChanges.endorsers
                }
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Changes
              </Button>
              <Button
                onClick={onUpdate}
                disabled={
                  !pendingChanges.admins &&
                  !pendingChanges.scriptCodeHashes &&
                  !pendingChanges.tippingConfig &&
                  !pendingChanges.endorsers
                }
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="h-4 w-4 mr-2" />
                Save All Changes
              </Button>
              <Button onClick={refreshProtocolData} disabled={isLoading}>
                <Activity className="h-4 w-4 mr-2" />
                {isLoading ? "Loading..." : "Refresh Data"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Contract Deployment Status Check */}
      {!contractDeploymentStatus.allDeployed && (
        <Alert className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle>Some Contracts Not Deployed</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              The following contracts are missing from the deployment records:
            </p>
            <ul className="list-disc list-inside space-y-1">
              {contractDeploymentStatus.missingContracts.map(contract => (
                <li key={contract} className="text-sm">
                  {contract}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              The protocol cell will be created with placeholder (zero) hashes for missing contracts. 
              You'll need to redeploy the protocol cell after all contracts are deployed.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Protocol Deployment Check */}
      {(() => {
        const configStatus = getProtocolConfigStatus();

        if (configStatus === "none") {
          return (
            <Card className="border-red-500 bg-red-50 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="flex items-center text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Protocol Contract Not Deployed
                </CardTitle>
                <CardDescription className="text-red-600 dark:text-red-400">
                  The CKBoost protocol contract (Type Script) has not been
                  deployed on-chain yet. This is the smart contract code that
                  defines protocol behavior.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="font-mono text-sm mb-2">
                      1. Deploy the protocol contract on-chain:
                    </p>
                    <code className="block bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                      # This deploys the actual smart contract code to the
                      blockchain ccc-deploy deploy generic_contract
                      ./contracts/build/release/ckboost-protocol-type --typeId
                      --network=testnet
                    </code>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="font-mono text-sm mb-2">
                      2. Record the deployment in deployments.json
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      The deployment information should be automatically
                      recorded
                    </p>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    After deploying the contract, restart the dApp to continue.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        }

        if (configStatus === "partial") {
          return (
            <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <CardHeader>
                <CardTitle className="flex items-center text-yellow-700 dark:text-yellow-300">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Protocol Contract Deployed - Cell Creation Required
                </CardTitle>
                <CardDescription className="text-yellow-600 dark:text-yellow-400">
                  ✓ Protocol contract is deployed on-chain (type hash:{" "}
                  {deploymentTemplate.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash.toString()}
                  ...)
                  <br />✗ No protocol cell exists yet - you need to create one
                  to store protocol data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isProtocolNotFoundError && (
                    <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg space-y-2">
                      <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                        ⚠️ Protocol cell search failed
                      </p>
                      <pre className="text-xs text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">
                        {error}
                      </pre>
                    </div>
                  )}
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <h4 className="text-sm font-semibold mb-2">
                      What's the difference?
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                      <li>
                        • <strong>Protocol Contract</strong>: The smart contract
                        code (Type Script) deployed on-chain
                      </li>
                      <li>
                        • <strong>Protocol Cell</strong>: A data storage cell
                        that uses the protocol contract and contains your
                        protocol configuration
                      </li>
                    </ul>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
                    To create your first protocol cell:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <li>Configure the protocol settings in the forms below</li>
                    <li>
                      Your admin lock hash is auto-filled from your connected
                      wallet
                    </li>
                    <li>
                      Set the script code hashes (use zero hashes for contracts
                      not yet deployed)
                    </li>
                    <li>Configure tipping settings</li>
                    <li>
                      Click "Deploy Protocol Cell" at the bottom of the page
                    </li>
                  </ol>
                  {!isWalletConnected && (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                      ⚠️ Connect your wallet to proceed with deployment
                    </p>
                  )}
                  {deploymentResult && (
                    <div className="mt-4 p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                        ✅ Protocol cell deployed!
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-mono break-all">
                        Transaction: {deploymentResult.txHash}
                      </p>
                      <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded">
                        <p className="text-xs font-mono break-all">
                          NEXT_PUBLIC_PROTOCOL_TYPE_ARGS={deploymentResult.args}
                        </p>
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                        Add this to your .env.local and restart the app.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        }

        return null; // configStatus === 'complete', show normal protocol management
      })()}

      {/* Manual Outpoint Loading Dialog */}
      <Dialog open={showOutpointDialog} onOpenChange={setShowOutpointDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Load Protocol Cell by Outpoint</DialogTitle>
            <DialogDescription>
              Manually specify a protocol cell outpoint to load. This will
              replace the current protocol data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="txHash" className="text-sm font-medium">
                Transaction Hash
              </label>
              <Input
                id="txHash"
                placeholder="0x..."
                value={outpointTxHash}
                onChange={(e) => setOutpointTxHash(e.target.value as ccc.Hex)}
                disabled={isLoadingOutpoint}
              />
              <p className="text-xs text-muted-foreground">
                The transaction hash where the protocol cell was created
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="index" className="text-sm font-medium">
                Output Index
              </label>
              <Input
                id="index"
                type="number"
                placeholder="0"
                value={outpointIndex.toString()}
                onChange={(e) => setOutpointIndex(BigInt(e.target.value))}
                disabled={isLoadingOutpoint}
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                The index of the output in the transaction (usually 0)
              </p>
            </div>

            {process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH && (
              <div className="text-xs text-muted-foreground p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <strong>Current Environment Config:</strong>
                <br />
                Code Hash:{" "}
                {process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH.slice(0, 10)}
                ...
                <br />
                This will be overridden when loading by outpoint.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowOutpointDialog(false)}
              disabled={isLoadingOutpoint}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metrics Overview */}
      {metrics && (
        <ProtocolStats 
          metrics={metrics} 
          protocolData={protocolData}
        />
      )}

      {/* Protocol Configuration */}
      {(protocolData ||
        configStatus === "partial" ||
        isProtocolNotFoundError) && (
        <div className="space-y-6">
          {/* Admin Management - Add Admin and Current Admins */}
          {shouldShowSection(pendingChanges.admins) && (
            <AdminManagement
              adminForm={adminForm}
              protocolData={protocolData}
              pendingChanges={{ admins: pendingChanges.admins }}
              pendingAdminChanges={pendingAdminChanges}
              finalAdminLockHashes={finalAdminLockHashes}
              onAddAdmin={onAddAdmin}
              onRemoveAdmin={onRemoveAdmin}
            />
          )}

          {/* Tipping Configuration */}
          {shouldShowSection(pendingChanges.tippingConfig) && (
            <TippingConfig
              form={tippingConfigForm}
              pendingChanges={pendingChanges.tippingConfig}
              ChangeIndicator={ChangeIndicator}
            />
          )}

          {/* Script Code Hashes Configuration */}
          {shouldShowSection(pendingChanges.scriptCodeHashes) && (
            <ScriptCodeHashes
              form={scriptCodeHashesForm}
              pendingChanges={pendingChanges.scriptCodeHashes}
              ChangeIndicator={ChangeIndicator}
            />
          )}

          {/* Endorsers Management */}
          {shouldShowSection(pendingChanges.endorsers) && (
            <EndorserManagement
              endorserForm={endorserForm}
              protocolData={protocolData}
              pendingChanges={pendingChanges.endorsers}
              pendingEndorserChanges={pendingEndorserChanges}
              onAddEndorser={onAddEndorser}
              onRemoveEndorser={onRemoveEndorser}
              getPreviewLockHash={getPreviewLockHash}
            />
          )}

          {/* Protocol Summary or Deployment Button */}
          {configStatus === "partial" ||
          (error &&
            (error.includes("corrupted") || error.includes("incompatible"))) ? (
            <ProtocolDeploymentSection
              configStatus={configStatus}
              error={error}
              isDeploying={isDeploying}
              isWalletConnected={isWalletConnected}
              onDeployProtocol={handleDeployProtocol}
              onResetChanges={resetAllChanges}
            />
          ) : (
            <ProtocolSummarySection
              protocolData={protocolData}
              protocolCell={protocolCell}
            />
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ProtocolChangesDialog
        open={showConfirmationDialog}
        onOpenChange={setShowConfirmationDialog}
        protocolChanges={protocolChanges}
        pendingChanges={pendingChanges}
        pendingAdminChanges={pendingAdminChanges}
        pendingEndorserChanges={pendingEndorserChanges}
        onConfirm={confirmUpdate}
      />
    </div>
  );
}
