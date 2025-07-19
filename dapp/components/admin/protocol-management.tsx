"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Plus, 
  Settings, 
  History, 
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  UserPlus,
  Trash2,
  Save,
  Eye,
  EyeOff,
  FileSearch
} from "lucide-react"
import {
  ProtocolTransaction,
  ProtocolMetrics,
  UpdateProtocolConfigForm,
  UpdateScriptCodeHashesForm,
  UpdateTippingConfigForm,
  AddEndorserForm,
  EditEndorserForm,
  Script,
  BatchUpdateProtocolForm,
  ProtocolChanges
} from "@/lib/types/protocol"
import { 
  formatTimestamp, 
  getCampaignStatusText,
  getQuestStatusText 
} from "@/lib/services/protocol-service"
import { useProtocol, useProtocolAdmin } from "@/lib/providers/protocol-provider"
import type { ProtocolDataType } from "ssri-ckboost/types"
import { bufferToHex, bufferToNumber, bufferToString } from "@/lib/utils/type-converters"
import { ccc } from "@ckb-ccc/connector-react"
import { computeLockHashWithPrefix } from "@/lib/utils/address-utils"
import { 
  isProtocolConfigured, 
  getProtocolDeploymentTemplate, 
  deployProtocolCell, 
  validateDeploymentParams,
  generateEnvConfig,
  type DeployProtocolCellParams 
} from "@/lib/ckb/protocol-deployment"

// Form schemas
const updateProtocolConfigSchema = z.object({
  adminLockHashes: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid lock hash format")).min(1, "At least one admin required")
})

const updateScriptCodeHashesSchema = z.object({
  ckbBoostProtocolTypeCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckbBoostProtocolLockCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckbBoostCampaignTypeCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckbBoostCampaignLockCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
  ckbBoostUserTypeCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format")
})

const updateTippingConfigSchema = z.object({
  approvalRequirementThresholds: z.array(z.string().regex(/^\d+$/, "Must be a valid number")).min(1, "At least one threshold required"),
  expirationDuration: z.number().min(3600, "Minimum 1 hour").max(2592000, "Maximum 30 days")
})

const addEndorserSchema = z.object({
  inputMode: z.enum(["address", "script"]),
  endorserAddress: z.string().optional(),
  endorserLockScript: z.object({
    codeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
    hashType: z.enum(["type", "data", "data1"]),
    args: z.string().regex(/^0x[a-fA-F0-9]*$/, "Invalid args format")
  }).optional(),
  endorserName: z.string().min(1, "Name required"),
  endorserDescription: z.string().min(1, "Description required")
}).refine((data) => {
  if (data.inputMode === "address") {
    return data.endorserAddress && data.endorserAddress.length > 0
  } else {
    return data.endorserLockScript && 
           data.endorserLockScript.codeHash && 
           data.endorserLockScript.args
  }
}, {
  message: "Either address or script must be provided",
  path: ["endorserAddress"]
})

const deployProtocolSchema = z.object({
  adminLockHashes: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid lock hash format")).min(1, "At least one admin required"),
  scriptCodeHashes: z.object({
    ckbBoostProtocolTypeCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
    ckbBoostProtocolLockCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
    ckbBoostCampaignTypeCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
    ckbBoostCampaignLockCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format"),
    ckbBoostUserTypeCodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid code hash format")
  }),
  tippingConfig: z.object({
    approvalRequirementThresholds: z.array(z.string().regex(/^\d+$/, "Must be a valid number")).min(1, "At least one threshold required"),
    expirationDuration: z.number().min(3600, "Minimum 1 hour").max(2592000, "Maximum 30 days")
  }),
  initialEndorsers: z.array(z.object({
    endorserLockHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid lock hash format"),
    endorserName: z.string().min(1, "Name required"),
    endorserDescription: z.string().min(1, "Description required")
  })).optional()
})


export function ProtocolManagement() {
  // Use protocol provider instead of direct service calls
  const {
    protocolData,
    metrics,
    transactions,
    isLoading,
    error,
    updateProtocolConfig: providerUpdateProtocolConfig,
    updateScriptCodeHashes: providerUpdateScriptCodeHashes,
    updateTippingConfig: providerUpdateTippingConfig,
    addEndorser: providerAddEndorser,
    editEndorser: providerEditEndorser,
    removeEndorser: providerRemoveEndorser,
    batchUpdateProtocol: providerBatchUpdateProtocol,
    calculateChanges: providerCalculateChanges,
    refreshProtocolData,
    loadProtocolDataByOutPoint: providerLoadProtocolDataByOutPoint,
    isWalletConnected
  } = useProtocol()

  // Get signer at the top level of the component
  const signer = ccc.useSigner()

  const protocolConfigForm = useForm<UpdateProtocolConfigForm>({
    resolver: zodResolver(updateProtocolConfigSchema),
    defaultValues: {
      adminLockHashes: []
    }
  })

  const scriptCodeHashesForm = useForm<UpdateScriptCodeHashesForm>({
    resolver: zodResolver(updateScriptCodeHashesSchema),
    defaultValues: {
      ckbBoostProtocolTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostProtocolLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostCampaignTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostCampaignLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostUserTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  })

  const tippingConfigForm = useForm<UpdateTippingConfigForm>({
    resolver: zodResolver(updateTippingConfigSchema),
    defaultValues: {
      approvalRequirementThresholds: ["10000", "50000", "100000"],
      expirationDuration: 604800 // 7 days
    }
  })

  const endorserForm = useForm<AddEndorserForm & { inputMode: "address" | "script" }>({
    resolver: zodResolver(addEndorserSchema),
    defaultValues: {
      inputMode: "address",
      endorserAddress: "",
      endorserLockScript: {
        codeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        hashType: "type",
        args: "0x"
      },
      endorserName: "",
      endorserDescription: ""
    }
  })

  const deploymentForm = useForm<DeployProtocolCellParams>({
    resolver: zodResolver(deployProtocolSchema),
    defaultValues: getProtocolDeploymentTemplate()
  })

  // State for managing change tracking
  const [showChangesOnly, setShowChangesOnly] = useState(false)
  const [protocolChanges, setProtocolChanges] = useState<ProtocolChanges | null>(null)
  const [previewLockHash, setPreviewLockHash] = useState<string>("")
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false)
  
  // State for protocol deployment
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(false)
  const [deploymentResult, setDeploymentResult] = useState<string>("")
  const [isDeploying, setIsDeploying] = useState(false)
  
  // State for manual outpoint loading
  const [showOutpointDialog, setShowOutpointDialog] = useState(false)
  const [outpointTxHash, setOutpointTxHash] = useState<string>("")
  const [outpointIndex, setOutpointIndex] = useState<string>("0")
  const [isLoadingOutpoint, setIsLoadingOutpoint] = useState(false)
  
  const [pendingChanges, setPendingChanges] = useState<{
    protocolConfig: boolean
    scriptCodeHashes: boolean
    tippingConfig: boolean
    endorsers: boolean
  }>({
    protocolConfig: false,
    scriptCodeHashes: false,
    tippingConfig: false,
    endorsers: false
  })


  // Update form defaults when protocol data changes
  useEffect(() => {
    if (protocolData) {
      // Convert SDK types to UI values
      protocolConfigForm.reset({
        adminLockHashes: protocolData.protocol_config.admin_lock_hash_vec.map(hash => bufferToHex(hash))
      })

      scriptCodeHashesForm.reset({
        ckbBoostProtocolTypeCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash),
        ckbBoostProtocolLockCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
        ckbBoostCampaignTypeCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),
        ckbBoostCampaignLockCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash),
        ckbBoostUserTypeCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash)
      })

      tippingConfigForm.reset({
        approvalRequirementThresholds: protocolData.tipping_config.approval_requirement_thresholds.map(t => bufferToNumber(t).toString()),
        expirationDuration: bufferToNumber(protocolData.tipping_config.expiration_duration)
      })
    }
  }, [protocolData, protocolConfigForm, scriptCodeHashesForm, tippingConfigForm])

  // Watch form changes to track modifications
  const protocolConfigValues = protocolConfigForm.watch()
  const scriptCodeHashesValues = scriptCodeHashesForm.watch()
  const tippingConfigValues = tippingConfigForm.watch()
  
  // Watch endorser form for preview lock hash computation
  const watchedInputMode = endorserForm.watch("inputMode")
  const watchedAddress = endorserForm.watch("endorserAddress")

  // Memoize the form data to prevent unnecessary recalculations
  const formData = useMemo(() => ({
    adminLockHashes: protocolConfigValues?.adminLockHashes,
    scriptCodeHashes: scriptCodeHashesValues,
    tippingConfig: tippingConfigValues
  }), [protocolConfigValues?.adminLockHashes, scriptCodeHashesValues, tippingConfigValues])

  // Calculate changes with proper dependency management
  useEffect(() => {
    if (!protocolData) return
    
    // Use a flag to prevent setting state if component unmounted
    let isActive = true
    
    // Add a small delay to debounce rapid changes
    const timeoutId = setTimeout(() => {
      if (!isActive) return
      
      try {
        const currentFormData = {
          adminLockHashes: protocolConfigValues?.adminLockHashes,
          scriptCodeHashes: scriptCodeHashesValues,
          tippingConfig: tippingConfigValues
        }
        
        if (!currentFormData.adminLockHashes || !currentFormData.scriptCodeHashes || !currentFormData.tippingConfig) {
          return
        }
        
        console.log("Calculating changes with data:", {
          protocolData: !!protocolData,
          currentFormData
        })
        
        const changes = providerCalculateChanges(currentFormData)
        
        if (isActive) {
          console.log("Changes calculated successfully:", changes)
          setProtocolChanges(changes)

          // Update pending changes indicators
          setPendingChanges({
            protocolConfig: changes.protocolConfig.adminLockHashes.hasChanged,
            scriptCodeHashes: Object.values(changes.scriptCodeHashes).some(change => change.hasChanged),
            tippingConfig: Object.values(changes.tippingConfig).some(change => change.hasChanged),
            endorsers: false // Will be updated when endorser operations are tracked
          })
        }
      } catch (error) {
        if (isActive) {
          console.error("Failed to calculate changes:", error)
          // Reset changes on error
          setProtocolChanges(null)
          setPendingChanges({
            protocolConfig: false,
            scriptCodeHashes: false,
            tippingConfig: false,
            endorsers: false
          })
        }
      }
    }, 100) // 100ms debounce
    
    return () => {
      isActive = false
      clearTimeout(timeoutId)
    }
  }, [
    protocolData,
    // Use JSON.stringify to create stable dependencies
    JSON.stringify(protocolConfigValues?.adminLockHashes),
    JSON.stringify(scriptCodeHashesValues),
    JSON.stringify(tippingConfigValues),
    providerCalculateChanges
  ])

  // Effect to compute preview lock hash when address changes
  useEffect(() => {
    if (watchedInputMode === "address" && watchedAddress && watchedAddress.trim() !== "") {
      computeLockHashFromAddress(watchedAddress)
        .then(hash => setPreviewLockHash(hash))
        .catch(error => {
          console.error("Failed to compute lock hash from address:", error)
          setPreviewLockHash("Invalid address format")
        })
    } else {
      setPreviewLockHash("")
    }
  }, [watchedInputMode, watchedAddress])

  const onUpdateProtocolConfig = async (data: UpdateProtocolConfigForm) => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    try {
      const txHash = await providerUpdateProtocolConfig(data)
      console.log("Protocol config updated:", txHash)
      alert(`Protocol configuration updated! Transaction: ${txHash}`)
    } catch (error) {
      console.error("Failed to update protocol config:", error)
      alert("Failed to update protocol configuration: " + (error as Error).message)
    }
  }

  const onUpdateScriptCodeHashes = async (data: UpdateScriptCodeHashesForm) => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    try {
      const txHash = await providerUpdateScriptCodeHashes(data)
      console.log("Script code hashes updated:", txHash)
      alert(`Script code hashes updated! Transaction: ${txHash}`)
    } catch (error) {
      console.error("Failed to update script code hashes:", error)
      alert("Failed to update script code hashes: " + (error as Error).message)
    }
  }

  const onUpdateTippingConfig = async (data: UpdateTippingConfigForm) => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    try {
      const txHash = await providerUpdateTippingConfig(data)
      console.log("Tipping config updated:", txHash)
      alert(`Tipping configuration updated! Transaction: ${txHash}`)
    } catch (error) {
      console.error("Failed to update tipping config:", error)
      alert("Failed to update tipping configuration: " + (error as Error).message)
    }
  }

  const onAddEndorser = async (data: AddEndorserForm & { inputMode: "address" | "script" }) => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    try {
      // Prepare the form data based on input mode
      const formData: AddEndorserForm = {
        endorserName: data.endorserName,
        endorserDescription: data.endorserDescription,
        endorserAddress: data.inputMode === "address" ? data.endorserAddress! : "",
        endorserLockScript: data.inputMode === "script" ? data.endorserLockScript! : {
          codeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          hashType: "type" as const,
          args: "0x"
        }
      }

      const txHash = await providerAddEndorser(formData)
      console.log("Endorser added:", txHash)
      alert(`Endorser added! Transaction: ${txHash}`)
      endorserForm.reset()
    } catch (error) {
      console.error("Failed to add endorser:", error)
      alert("Failed to add endorser: " + (error as Error).message)
    }
  }


  const onRemoveEndorser = async (index: number) => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    if (!confirm("Are you sure you want to remove this endorser?")) {
      return
    }

    try {
      const txHash = await providerRemoveEndorser(index)
      console.log("Endorser removed:", txHash)
      alert(`Endorser removed! Transaction: ${txHash}`)
    } catch (error) {
      console.error("Failed to remove endorser:", error)
      alert("Failed to remove endorser: " + (error as Error).message)
    }
  }

  const onBatchUpdate = () => {
    console.log("onBatchUpdate called", {
      isWalletConnected,
      protocolChanges: !!protocolChanges,
      pendingChanges,
      protocolData: !!protocolData
    })
    
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    if (!protocolData) {
      console.error("No protocol data available")
      alert("Protocol data not loaded. Please wait or refresh.")
      return
    }

    if (!protocolChanges) {
      console.error("No protocol changes available")
      alert("No changes detected")
      return
    }

    const hasChanges = pendingChanges.protocolConfig || 
                      pendingChanges.scriptCodeHashes || 
                      pendingChanges.tippingConfig

    if (!hasChanges) {
      console.warn("No pending changes detected")
      alert("No changes to update")
      return
    }

    console.log("Opening confirmation dialog")
    setShowConfirmationDialog(true)
  }

  const confirmBatchUpdate = async () => {
    try {
      const batchForm: BatchUpdateProtocolForm = {}

      if (pendingChanges.protocolConfig) {
        batchForm.protocolConfig = {
          adminLockHashes: formData.adminLockHashes!
        }
      }

      if (pendingChanges.scriptCodeHashes) {
        batchForm.scriptCodeHashes = formData.scriptCodeHashes!
      }

      if (pendingChanges.tippingConfig) {
        batchForm.tippingConfig = formData.tippingConfig!
      }

      const txHash = await providerBatchUpdateProtocol(batchForm)
      console.log("Protocol batch updated:", txHash)
      alert(`Protocol updated successfully! Transaction: ${txHash}`)
      
      // Reset pending changes and close dialog
      setPendingChanges({
        protocolConfig: false,
        scriptCodeHashes: false,
        tippingConfig: false,
        endorsers: false
      })
      setShowConfirmationDialog(false)
    } catch (error) {
      console.error("Failed to batch update protocol:", error)
      alert("Failed to update protocol: " + (error as Error).message)
      setShowConfirmationDialog(false)
    }
  }

  const toggleChangesView = () => {
    setShowChangesOnly(!showChangesOnly)
  }
  
  const handleLoadByOutpoint = async () => {
    if (!outpointTxHash || !outpointIndex) {
      alert("Please enter both transaction hash and index")
      return
    }
    
    setIsLoadingOutpoint(true)
    try {
      await providerLoadProtocolDataByOutPoint({
        txHash: outpointTxHash.startsWith('0x') ? outpointTxHash : `0x${outpointTxHash}`,
        index: parseInt(outpointIndex)
      })
      setShowOutpointDialog(false)
      setOutpointTxHash("")
      setOutpointIndex("0")
      alert("Protocol data loaded successfully from the specified outpoint")
    } catch (error) {
      console.error("Failed to load protocol data by outpoint:", error)
      alert("Failed to load protocol data: " + (error as Error).message)
    } finally {
      setIsLoadingOutpoint(false)
    }
  }

  // Helper function to render change indicator badge
  const ChangeIndicator = ({ hasChanged }: { hasChanged: boolean }) => {
    if (!hasChanged) return null
    return (
      <Badge variant="destructive" className="ml-2 text-xs">
        Modified
      </Badge>
    )
  }

  // Helper function to compute lock hash from script using CCC
  const computeLockHashFromScript = (script: Script | undefined): string => {
    if (!script || !script.codeHash || !script.args) {
      return "Invalid script - missing required fields"
    }
    
    try {
      // Create CCC Script object and compute hash
      const cccScript = ccc.Script.from({
        codeHash: script.codeHash,
        hashType: script.hashType,
        args: script.args
      })
      return cccScript.hash()
    } catch (error) {
      console.error("Failed to compute script hash:", error)
      return "Invalid script format"
    }
  }

  // Helper function to compute lock hash from address using CCC
  const computeLockHashFromAddress = async (address: string): Promise<string> => {
    if (!address || address.trim() === "") {
      return "Enter an address to preview lock hash"
    }

    try {
      return await computeLockHashWithPrefix(address)
    } catch (error) {
      console.error("Failed to parse address:", error)
      return "Invalid address format"
    }
  }

  // Helper function to preview lock hash based on input mode
  const getPreviewLockHash = (): string => {
    const inputMode = endorserForm.watch("inputMode")
    const address = endorserForm.watch("endorserAddress")
    const script = endorserForm.watch("endorserLockScript")

    if (inputMode === "address") {
      if (!address || address.trim() === "") {
        return "Enter an address to preview lock hash"
      }
      // We'll use a state variable to store the computed hash from address
      return previewLockHash || "Computing lock hash..."
    } else {
      return computeLockHashFromScript(script)
    }
  }

  // Protocol deployment handler
  const handleDeployProtocol = async (data: DeployProtocolCellParams) => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    try {
      setIsDeploying(true)
      
      // Use the signer from component level
      if (!signer) {
        throw new Error("No signer available. Please connect your wallet.")
      }

      // Validate deployment parameters
      const validationErrors = validateDeploymentParams(data)
      if (validationErrors.length > 0) {
        throw new Error("Validation failed: " + validationErrors.join(", "))
      }

      // Deploy the protocol cell
      const result = await deployProtocolCell(signer, data)
      
      // Generate environment configuration
      const envConfig = generateEnvConfig(result)
      
      setDeploymentResult(envConfig)
      alert("Protocol deployed successfully! Check the environment configuration below.")
      
    } catch (error) {
      console.error("Failed to deploy protocol:", error)
      alert("Failed to deploy protocol: " + (error as Error).message)
      setDeploymentResult("")
    } finally {
      setIsDeploying(false)
    }
  }

  // Initialize deployment form with user's lock hash
  useEffect(() => {
    const initializeDeploymentForm = async () => {
      try {
        if (signer && isWalletConnected) {
          const address = await signer.getRecommendedAddress()
          const userLockHash = await computeLockHashWithPrefix(address)
          
          // Update deployment form with user's lock hash as admin
          deploymentForm.setValue("adminLockHashes", [userLockHash])
        }
      } catch (error) {
        console.error("Failed to initialize deployment form:", error)
      }
    }

    if (isWalletConnected && showDeploymentDialog) {
      initializeDeploymentForm()
    }
  }, [signer, isWalletConnected, showDeploymentDialog, deploymentForm])


  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      confirmed: "default",
      pending: "secondary",
      failed: "destructive"
    }
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold">Failed to Load Protocol Data</h3>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={refreshProtocolData} className="mt-2">
              <Activity className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Protocol Management</h2>
          <p className="text-muted-foreground">Manage CKB protocol configuration and data</p>
          {(pendingChanges.protocolConfig || pendingChanges.scriptCodeHashes || pendingChanges.tippingConfig) && (
            <p className="text-orange-600 text-sm font-medium mt-1">
              ⚠️ You have unsaved changes
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={toggleChangesView} 
            variant="outline"
            size="sm"
          >
            {showChangesOnly ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {showChangesOnly ? "Show All" : "Show Changes Only"}
          </Button>
          <Button 
            onClick={onBatchUpdate} 
            disabled={!pendingChanges.protocolConfig && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="h-4 w-4 mr-2" />
            Save All Changes
          </Button>
          <Button onClick={refreshProtocolData} disabled={isLoading}>
            <Activity className="h-4 w-4 mr-2" />
            {isLoading ? "Loading..." : "Refresh Data"}
          </Button>
          <Button 
            onClick={() => setShowOutpointDialog(true)} 
            variant="outline"
            disabled={!isWalletConnected}
            title={!isWalletConnected ? "Connect wallet to load by outpoint" : ""}
          >
            <FileSearch className="h-4 w-4 mr-2" />
            Load by Outpoint
          </Button>
        </div>
      </div>

      {/* Protocol Deployment Check */}
      {!isProtocolConfigured() && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-700 dark:text-yellow-300">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Protocol Not Deployed
            </CardTitle>
            <CardDescription className="text-yellow-600 dark:text-yellow-400">
              No protocol type script configuration found. You need to deploy a protocol cell before managing protocol data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => setShowDeploymentDialog(true)}
                className="bg-yellow-600 hover:bg-yellow-700"
                disabled={!isWalletConnected}
              >
                <Plus className="h-4 w-4 mr-2" />
                Deploy Protocol Cell
              </Button>
              {!isWalletConnected && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 self-center">
                  Connect your wallet to deploy the protocol
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Dialog */}
      <Dialog open={showDeploymentDialog} onOpenChange={setShowDeploymentDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deploy Protocol Cell</DialogTitle>
            <DialogDescription>
              Deploy a new protocol cell to the CKB blockchain with initial configuration.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...deploymentForm}>
            <form onSubmit={deploymentForm.handleSubmit(handleDeployProtocol)} className="space-y-6">
              {/* Admin Configuration */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Admin Configuration</h4>
                <FormField
                  control={deploymentForm.control}
                  name="adminLockHashes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Lock Hashes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="0x... (one per line)"
                          value={field.value.join('\n')}
                          onChange={(e) => field.onChange(e.target.value.split('\n').filter(Boolean))}
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>Lock hashes of protocol administrators (your wallet is pre-filled)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Script Code Hashes */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Script Code Hashes</h4>
                <div className="grid lg:grid-cols-2 gap-4">
                  <FormField
                    control={deploymentForm.control}
                    name="scriptCodeHashes.ckbBoostProtocolTypeCodeHash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Protocol Type Code Hash</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0x..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={deploymentForm.control}
                    name="scriptCodeHashes.ckbBoostProtocolLockCodeHash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Protocol Lock Code Hash</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0x..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={deploymentForm.control}
                    name="scriptCodeHashes.ckbBoostCampaignTypeCodeHash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Type Code Hash</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0x..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={deploymentForm.control}
                    name="scriptCodeHashes.ckbBoostCampaignLockCodeHash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Lock Code Hash</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0x..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={deploymentForm.control}
                    name="scriptCodeHashes.ckbBoostUserTypeCodeHash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>User Type Code Hash</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0x..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Tipping Configuration */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Tipping Configuration</h4>
                <FormField
                  control={deploymentForm.control}
                  name="tippingConfig.approvalRequirementThresholds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Approval Thresholds (Shannons)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="10000 (one per line)"
                          value={field.value ? field.value.join('\n') : ''}
                          onChange={(e) => field.onChange(e.target.value.split('\n').filter(Boolean))}
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>CKB amounts in shannons that require approval</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={deploymentForm.control}
                  name="tippingConfig.expirationDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiration Duration (seconds)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          placeholder="604800"
                        />
                      </FormControl>
                      <FormDescription>How long proposals remain valid (default: 7 days)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Deployment Result */}
              {deploymentResult && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-green-600">Deployment Successful!</h4>
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                    <pre className="text-sm whitespace-pre-wrap">{deploymentResult}</pre>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Copy the configuration above to your .env file and restart your application to start managing the protocol.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeploymentDialog(false)}
                  disabled={isDeploying}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isDeploying || !isWalletConnected}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {isDeploying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Deploy Protocol
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Manual Outpoint Loading Dialog */}
      <Dialog open={showOutpointDialog} onOpenChange={setShowOutpointDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Load Protocol Cell by Outpoint</DialogTitle>
            <DialogDescription>
              Manually specify a protocol cell outpoint to load. This will replace the current protocol data.
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
                onChange={(e) => setOutpointTxHash(e.target.value)}
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
                value={outpointIndex}
                onChange={(e) => setOutpointIndex(e.target.value)}
                disabled={isLoadingOutpoint}
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                The index of the output in the transaction (usually 0)
              </p>
            </div>
            
            {process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH && (
              <div className="text-xs text-muted-foreground p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <strong>Current Environment Config:</strong><br />
                Code Hash: {process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH.slice(0, 10)}...<br />
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
            <Button 
              onClick={handleLoadByOutpoint}
              disabled={isLoadingOutpoint || !outpointTxHash}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoadingOutpoint ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Loading...
                </>
              ) : (
                <>
                  <FileSearch className="h-4 w-4 mr-2" />
                  Load Cell
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalCampaigns}</div>
              <p className="text-xs text-muted-foreground">{metrics.activeCampaigns} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tipping Proposals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalTippingProposals}</div>
              <p className="text-xs text-muted-foreground">{metrics.pendingTippingProposals} pending</p>
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
              <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs">{formatTimestamp(new Date(metrics.lastUpdated).getTime())}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Active</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Protocol Configuration */}
      {protocolData && (
        <div className="space-y-6">
          {/* Admin and Script Configuration */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Protocol Configuration */}
            <Card className={pendingChanges.protocolConfig ? "border-orange-500" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  Protocol Configuration
                  <ChangeIndicator hasChanged={pendingChanges.protocolConfig} />
                </CardTitle>
                <CardDescription>Admin lock hashes configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...protocolConfigForm}>
                  <div className="space-y-4">
                    <FormField
                      control={protocolConfigForm.control}
                      name="adminLockHashes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admin Lock Hashes</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="0x... (one per line)"
                              value={field.value.join('\n')}
                              onChange={(e) => field.onChange(e.target.value.split('\n').filter(Boolean))}
                              rows={4}
                            />
                          </FormControl>
                          <FormDescription>One lock hash per line (Byte32)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </div>
                </Form>
              </CardContent>
            </Card>

            {/* Tipping Configuration */}
            <Card className={pendingChanges.tippingConfig ? "border-orange-500" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  Tipping Configuration
                  <ChangeIndicator hasChanged={pendingChanges.tippingConfig} />
                </CardTitle>
                <CardDescription>Tipping proposal settings</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...tippingConfigForm}>
                  <div className="space-y-4">
                    <FormField
                      control={tippingConfigForm.control}
                      name="approvalRequirementThresholds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Approval Thresholds (CKB)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="10000 (one per line)"
                              value={field.value.join('\n')}
                              onChange={(e) => field.onChange(e.target.value.split('\n').filter(Boolean))}
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription>One threshold per line. Min 3 approvals required.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={tippingConfigForm.control}
                      name="expirationDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration Duration (seconds)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              placeholder="604800"
                            />
                          </FormControl>
                          <FormDescription>How long proposals remain valid (e.g., 604800 = 7 days)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* Script Code Hashes Configuration */}
          <Card className={pendingChanges.scriptCodeHashes ? "border-orange-500" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center">
                Script Code Hashes Configuration
                <ChangeIndicator hasChanged={pendingChanges.scriptCodeHashes} />
              </CardTitle>
              <CardDescription>Configure individual script code hashes for the protocol</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...scriptCodeHashesForm}>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={scriptCodeHashesForm.control}
                      name="ckbBoostProtocolTypeCodeHash"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Protocol Type Code Hash</FormLabel>
                          <FormControl>
                            <Input placeholder="0x..." {...field} />
                          </FormControl>
                          <FormDescription>Byte32</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={scriptCodeHashesForm.control}
                      name="ckbBoostProtocolLockCodeHash"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Protocol Lock Code Hash</FormLabel>
                          <FormControl>
                            <Input placeholder="0x..." {...field} />
                          </FormControl>
                          <FormDescription>Byte32</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={scriptCodeHashesForm.control}
                      name="ckbBoostCampaignTypeCodeHash"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Campaign Type Code Hash</FormLabel>
                          <FormControl>
                            <Input placeholder="0x..." {...field} />
                          </FormControl>
                          <FormDescription>Byte32</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={scriptCodeHashesForm.control}
                      name="ckbBoostCampaignLockCodeHash"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Campaign Lock Code Hash</FormLabel>
                          <FormControl>
                            <Input placeholder="0x..." {...field} />
                          </FormControl>
                          <FormDescription>Byte32</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={scriptCodeHashesForm.control}
                      name="ckbBoostUserTypeCodeHash"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>User Type Code Hash</FormLabel>
                          <FormControl>
                            <Input placeholder="0x..." {...field} />
                          </FormControl>
                          <FormDescription>Byte32</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </Form>
            </CardContent>
          </Card>

          {/* Endorsers Management */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Endorser</CardTitle>
                <CardDescription>Add new endorsers to the protocol whitelist</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...endorserForm}>
                  <form onSubmit={endorserForm.handleSubmit(onAddEndorser)} className="space-y-4">
                    <FormField
                      control={endorserForm.control}
                      name="inputMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Input Method</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select input method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="address">CKB Address</SelectItem>
                              <SelectItem value="script">Lock Script</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Choose whether to provide a CKB address or directly input a lock script
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {endorserForm.watch("inputMode") === "address" ? (
                      <FormField
                        control={endorserForm.control}
                        name="endorserAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Endorser Address</FormLabel>
                            <FormControl>
                              <Input placeholder="ckb1..." {...field} />
                            </FormControl>
                            <FormDescription>CKB address of the endorser</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <div className="space-y-2">
                        <FormLabel>Endorser Lock Script</FormLabel>
                        <div className="grid grid-cols-1 gap-2">
                          <FormField
                            control={endorserForm.control}
                            name="endorserLockScript.codeHash"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="Code Hash (0x...)" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <FormField
                              control={endorserForm.control}
                              name="endorserLockScript.hashType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Hash Type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="type">type</SelectItem>
                                        <SelectItem value="data">data</SelectItem>
                                        <SelectItem value="data1">data1</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={endorserForm.control}
                              name="endorserLockScript.args"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="Args (0x...)" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Lock Hash Preview */}
                    <div className="p-3 bg-muted rounded-md">
                      <div className="text-sm font-medium mb-1">Lock Hash Preview</div>
                      <div className="text-xs font-mono text-muted-foreground break-all">
                        {getPreviewLockHash()}
                      </div>
                    </div>
                    <FormField
                      control={endorserForm.control}
                      name="endorserName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endorser Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={endorserForm.control}
                      name="endorserDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Description of the endorser..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Endorser
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Endorsers</CardTitle>
                <CardDescription>Active endorsers ({protocolData.endorsers_whitelist.length})</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {protocolData.endorsers_whitelist.map((endorser: any, index: number) => (
                    <div key={index} className="p-3 border rounded">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{bufferToString(endorser.endorser_name)}</div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="text-xs">Active</Badge>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => onRemoveEndorser(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {bufferToString(endorser.endorser_description)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Lock Hash:</span>{" "}
                          <span className="font-mono">{bufferToHex(endorser.endorser_lock_hash)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {protocolData.endorsers_whitelist.length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      No endorsers configured
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Protocol Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Protocol Summary</CardTitle>
              <CardDescription>Overview of current protocol configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium">Last Updated</div>
                  <div className="text-muted-foreground">{formatTimestamp(bufferToNumber(protocolData.last_updated) * 1000)}</div>
                </div>
                <div>
                  <div className="font-medium">Admin Addresses</div>
                  <div className="text-muted-foreground">{protocolData.protocol_config.admin_lock_hash_vec.length}</div>
                </div>
                <div>
                  <div className="font-medium">Active Endorsers</div>
                  <div className="text-muted-foreground">{protocolData.endorsers_whitelist.length}</div>
                </div>
                <div>
                  <div className="font-medium">Protocol Status</div>
                  <div className="text-muted-foreground">Active</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmationDialog} onOpenChange={setShowConfirmationDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Confirm Protocol Changes</DialogTitle>
            <DialogDescription>
              Review the changes you're about to make. All modifications will be applied in a single transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 max-h-96 overflow-y-auto">
            {protocolChanges && (
              <>
                {/* Protocol Configuration Changes */}
                {pendingChanges.protocolConfig && (
                  <div className="border rounded p-4">
                    <h4 className="font-medium mb-3 flex items-center">
                      <Settings className="h-4 w-4 mr-2" />
                      Protocol Configuration Changes
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Admin Lock Hashes:</span>
                        <div className="mt-1 space-y-1">
                          <div className="text-red-600">
                            - Previous: {protocolChanges.protocolConfig.adminLockHashes.oldValue.join(', ')}
                          </div>
                          <div className="text-green-600">
                            + New: {protocolChanges.protocolConfig.adminLockHashes.newValue.join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Script Code Hashes Changes */}
                {pendingChanges.scriptCodeHashes && (
                  <div className="border rounded p-4">
                    <h4 className="font-medium mb-3 flex items-center">
                      <Settings className="h-4 w-4 mr-2" />
                      Script Code Hashes Changes
                    </h4>
                    <div className="space-y-2 text-sm">
                      {Object.entries(protocolChanges.scriptCodeHashes).map(([key, change]) => (
                        change.hasChanged && (
                          <div key={key}>
                            <span className="font-medium">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span>
                            <div className="mt-1 space-y-1">
                              <div className="text-red-600 font-mono text-xs">
                                - {change.oldValue}
                              </div>
                              <div className="text-green-600 font-mono text-xs">
                                + {change.newValue}
                              </div>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}

                {/* Tipping Configuration Changes */}
                {pendingChanges.tippingConfig && (
                  <div className="border rounded p-4">
                    <h4 className="font-medium mb-3 flex items-center">
                      <Settings className="h-4 w-4 mr-2" />
                      Tipping Configuration Changes
                    </h4>
                    <div className="space-y-2 text-sm">
                      {protocolChanges.tippingConfig.approvalRequirementThresholds.hasChanged && (
                        <div>
                          <span className="font-medium">Approval Thresholds:</span>
                          <div className="mt-1 space-y-1">
                            <div className="text-red-600">
                              - Previous: {protocolChanges.tippingConfig.approvalRequirementThresholds.oldValue.join(', ')}
                            </div>
                            <div className="text-green-600">
                              + New: {protocolChanges.tippingConfig.approvalRequirementThresholds.newValue.join(', ')}
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
              </>
            )}

            {(!protocolChanges || (!pendingChanges.protocolConfig && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig)) && (
              <div className="text-center text-muted-foreground py-8">
                No changes detected
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmationDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmBatchUpdate}
              disabled={!protocolChanges || (!pendingChanges.protocolConfig && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Confirm & Update Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}