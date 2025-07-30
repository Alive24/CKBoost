"use client"

import React, { useState, useEffect, useMemo } from "react"
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
  FileSearch,
  Users,
  RotateCcw
} from "lucide-react"
import {
  UpdateScriptCodeHashesForm,
  UpdateTippingConfigForm,
  AddEndorserForm,
  Script,
  BatchUpdateProtocolForm,
  ProtocolChanges
} from "@/lib/types/protocol"
import { 
  formatTimestamp
} from "@/lib/services/protocol-service"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { bufferToHex, bufferToNumber, bufferToString } from "@/lib/utils/type-converters"
import { ccc } from "@ckb-ccc/connector-react"
import { computeLockHashWithPrefix } from "@/lib/utils/address-utils"
import { 
  getProtocolConfigStatus, 
  getProtocolDeploymentTemplate, 
  deployProtocolCell, 
  validateDeploymentParams,
  type DeployProtocolCellParams 
} from "@/lib/ckb/protocol-deployment"

// Form types
type AddAdminForm = {
  inputMode: "address" | "script"
  adminAddress?: string
  adminLockHash?: string
}

// Form schemas
const addAdminSchema = z.object({
  inputMode: z.enum(["address", "script"]),
  adminAddress: z.string().optional(),
  adminLockHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid lock hash format").optional()
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

  const adminForm = useForm<AddAdminForm>({
    resolver: zodResolver(addAdminSchema),
    defaultValues: {
      inputMode: "address",
      adminAddress: "",
      adminLockHash: ""
    }
  })

  // Get initial values from deployment template for forms
  const deploymentTemplate = useMemo(() => getProtocolDeploymentTemplate(), [])
  
  const scriptCodeHashesForm = useForm<UpdateScriptCodeHashesForm>({
    resolver: zodResolver(updateScriptCodeHashesSchema),
    defaultValues: {
      ckbBoostProtocolTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
      ckbBoostProtocolLockCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
      ckbBoostCampaignTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
      ckbBoostCampaignLockCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
      ckbBoostUserTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostUserTypeCodeHash
    }
  })

  const tippingConfigForm = useForm<UpdateTippingConfigForm>({
    resolver: zodResolver(updateTippingConfigSchema),
    defaultValues: {
      approvalRequirementThresholds: deploymentTemplate.tippingConfig.approvalRequirementThresholds,
      expirationDuration: deploymentTemplate.tippingConfig.expirationDuration
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


  // State for managing change tracking
  const [showChangesOnly, setShowChangesOnly] = useState(false)
  const [protocolChanges, setProtocolChanges] = useState<ProtocolChanges | null>(null)
  const [previewLockHash, setPreviewLockHash] = useState<string>("")
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false)
  
  // State for manual outpoint loading
  const [showOutpointDialog, setShowOutpointDialog] = useState(false)
  const [outpointTxHash, setOutpointTxHash] = useState<string>("")
  const [outpointIndex, setOutpointIndex] = useState<string>("0")
  const [isLoadingOutpoint, setIsLoadingOutpoint] = useState(false)
  
  // State for protocol deployment
  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentResult, setDeploymentResult] = useState<{txHash: string; args: string} | null>(null)
  
  // Track the baseline values that forms were reset to, to prevent false change detection
  const [baselineValues, setBaselineValues] = useState<{
    scriptCodeHashes: UpdateScriptCodeHashesForm | null
    tippingConfig: UpdateTippingConfigForm | null
  }>({
    scriptCodeHashes: null,
    tippingConfig: null
  })
  
  const [pendingChanges, setPendingChanges] = useState<{
    admins: boolean
    scriptCodeHashes: boolean
    tippingConfig: boolean
    endorsers: boolean
  }>({
    admins: false,
    scriptCodeHashes: false,
    tippingConfig: false,
    endorsers: false
  })
  
  // State for admin management - moved up to be available in useEffect
  const [pendingAdminChanges, setPendingAdminChanges] = useState<{
    toAdd: string[]
    toRemove: number[]
  }>({
    toAdd: [],
    toRemove: []
  })
  
  // State for endorser management - moved up to be available in useEffect
  const [pendingEndorserChanges, setPendingEndorserChanges] = useState<{
    toAdd: Array<{
      endorserName: string
      endorserDescription: string
      endorserLockHash: string
      endorserLockScript: {
        codeHash: string
        hashType: "type" | "data" | "data1"
        args: string
      }
      endorserAddress?: string
    }>
    toRemove: number[]
  }>({
    toAdd: [],
    toRemove: []
  })


  // Get config status once
  const configStatus = getProtocolConfigStatus()
  
  // Initialize forms for deployment when no protocol cell exists
  useEffect(() => {
    const initializeForDeployment = async () => {
      if (configStatus === 'partial' && signer && isWalletConnected) {
        try {
          // Get user's lock hash for admin configuration
          const address = await signer.getRecommendedAddress()
          const userLockHash = await computeLockHashWithPrefix(address)
          
          // Set initial admin as the current user
          setPendingAdminChanges({
            toAdd: [userLockHash],
            toRemove: []
          })
          setPendingChanges(prev => ({ ...prev, admins: true }))
          
          // Set baseline values to prevent false change detection
          // Forms already have the correct default values from deploymentTemplate
          setBaselineValues({
            scriptCodeHashes: {
              ckbBoostProtocolTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
              ckbBoostProtocolLockCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
              ckbBoostCampaignTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
              ckbBoostCampaignLockCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
              ckbBoostUserTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostUserTypeCodeHash
            },
            tippingConfig: {
              approvalRequirementThresholds: deploymentTemplate.tippingConfig.approvalRequirementThresholds,
              expirationDuration: deploymentTemplate.tippingConfig.expirationDuration
            }
          })
        } catch (error) {
          console.error("Failed to initialize deployment forms:", error)
        }
      }
    }
    
    if (configStatus === 'partial') {
      initializeForDeployment()
    }
  }, [configStatus, signer, isWalletConnected, deploymentTemplate])

  // Update form defaults when protocol data changes (only for existing protocol)
  useEffect(() => {
    if (protocolData && configStatus === 'complete') {
      // Don't reset admin changes - they're managed separately now

      const scriptHashesValues = {
        ckbBoostProtocolTypeCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash),
        ckbBoostProtocolLockCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
        ckbBoostCampaignTypeCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),
        ckbBoostCampaignLockCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash),
        ckbBoostUserTypeCodeHash: bufferToHex(protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash)
      }

      const tippingValues = {
        approvalRequirementThresholds: protocolData.tipping_config.approval_requirement_thresholds.map(t => bufferToNumber(t).toString()),
        expirationDuration: bufferToNumber(protocolData.tipping_config.expiration_duration)
      }

      scriptCodeHashesForm.reset(scriptHashesValues)
      tippingConfigForm.reset(tippingValues)

      // Set baseline values to prevent false change detection
      setBaselineValues({
        scriptCodeHashes: scriptHashesValues,
        tippingConfig: tippingValues
      })
    }
  }, [protocolData, configStatus, scriptCodeHashesForm, tippingConfigForm])

  // Watch form changes to track modifications
  const scriptCodeHashesValues = scriptCodeHashesForm.watch()
  const tippingConfigValues = tippingConfigForm.watch()
  
  // Watch endorser form for preview lock hash computation
  const watchedInputMode = endorserForm.watch("inputMode")
  const watchedAddress = endorserForm.watch("endorserAddress")

  // Calculate the final admin list based on current state and pending changes
  const finalAdminLockHashes = useMemo(() => {
    // For deployment, start with empty array if no protocol data
    if (!protocolData && configStatus === 'partial') {
      return pendingAdminChanges.toAdd
    }
    
    const currentAdmins = protocolData?.protocol_config.admin_lock_hash_vec.map(hash => bufferToHex(hash)) || []
    
    // Start with current admins
    let result = [...currentAdmins]
    
    // Remove admins marked for removal
    result = result.filter((_, index) => !pendingAdminChanges.toRemove.includes(index))
    
    // Add new admins
    result.push(...pendingAdminChanges.toAdd)
    
    return result
  }, [protocolData, pendingAdminChanges, configStatus])
  
  // Memoize the form data to prevent unnecessary recalculations
  const formData = useMemo(() => ({
    adminLockHashes: finalAdminLockHashes,
    scriptCodeHashes: scriptCodeHashesValues,
    tippingConfig: tippingConfigValues
  }), [finalAdminLockHashes, scriptCodeHashesValues, tippingConfigValues])

  // Calculate changes with proper dependency management
  useEffect(() => {
    if (!protocolData || !baselineValues.scriptCodeHashes || !baselineValues.tippingConfig) return
    
    // Check if current values match baseline values (no changes)
    const scriptHashesEqual = JSON.stringify(scriptCodeHashesValues) === JSON.stringify(baselineValues.scriptCodeHashes)
    const tippingEqual = JSON.stringify(tippingConfigValues) === JSON.stringify(baselineValues.tippingConfig)
    
    if (scriptHashesEqual && tippingEqual) {
      // No changes detected, clear pending changes
      setPendingChanges(prev => ({
        ...prev,
        scriptCodeHashes: false,
        tippingConfig: false
      }))
      setProtocolChanges(null)
      return
    }
    
    // Use a flag to prevent setting state if component unmounted
    let isActive = true
    
    // Add a small delay to debounce rapid changes
    const timeoutId = setTimeout(() => {
      if (!isActive) return
      
      try {
        const currentFormData = {
          adminLockHashes: finalAdminLockHashes,
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
          setPendingChanges(prev => ({
            ...prev,
            admins: changes.protocolConfig.adminLockHashes.hasChanged,
            scriptCodeHashes: Object.values(changes.scriptCodeHashes).some(change => change.hasChanged),
            tippingConfig: Object.values(changes.tippingConfig).some(change => change.hasChanged)
          }))
        }
      } catch (error) {
        if (isActive) {
          console.error("Failed to calculate changes:", error)
          // Reset changes on error
          setProtocolChanges(null)
          setPendingChanges({
            admins: false,
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
    JSON.stringify(finalAdminLockHashes),
    JSON.stringify(scriptCodeHashesValues),
    JSON.stringify(tippingConfigValues),
    JSON.stringify(baselineValues),
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

  const onAddAdmin = async (data: AddAdminForm & { inputMode: "address" | "script" }) => {
    try {
      let lockHash: string
      
      if (data.inputMode === "address" && data.adminAddress) {
        // Convert address to lock hash
        const address = await ccc.Address.fromString(data.adminAddress, signer!.client)
        lockHash = address.script.hash()
      } else if (data.inputMode === "script" && data.adminLockHash) {
        lockHash = data.adminLockHash
      } else {
        throw new Error("Please provide either an address or lock hash")
      }
      
      // Check if admin already exists or is pending
      const isDuplicate = 
        (protocolData?.protocol_config.admin_lock_hash_vec.some(
          (hash: any) => bufferToHex(hash) === lockHash
        )) ||
        pendingAdminChanges.toAdd.includes(lockHash)
      
      if (isDuplicate) {
        throw new Error("This admin already exists or is pending addition")
      }
      
      // Add to pending changes
      setPendingAdminChanges(prev => ({
        ...prev,
        toAdd: [...prev.toAdd, lockHash]
      }))
      
      // Update pending changes indicator
      setPendingChanges(prev => ({ ...prev, admins: true }))
      
      // Reset form after state update
      adminForm.reset({
        inputMode: "address",
        adminAddress: "",
        adminLockHash: ""
      })
    } catch (error) {
      console.error("Failed to add admin:", error)
      alert("Failed to add admin: " + (error as Error).message)
    }
  }
  
  const onRemoveAdmin = (index: number) => {
    // Add to removal list
    setPendingAdminChanges(prev => ({
      ...prev,
      toRemove: [...prev.toRemove, index]
    }))
    
    // Update pending changes indicator
    setPendingChanges(prev => ({ ...prev, admins: true }))
  }

  const onAddEndorser = async (data: AddEndorserForm & { inputMode: "address" | "script" }) => {
    try {
      let lockHash: string
      let lockScript: { codeHash: string; hashType: "type" | "data" | "data1"; args: string }
      
      if (data.inputMode === "address" && data.endorserAddress) {
        // Compute lock hash from address
        lockHash = await computeLockHashWithPrefix(data.endorserAddress)
        // For address mode, we need to derive the lock script from the address
        // This is a simplified approach - in production you'd need proper address parsing
        lockScript = {
          codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8", // Default secp256k1_blake160
          hashType: "type" as const,
          args: lockHash.slice(0, 42) // First 20 bytes of lock hash as args
        }
      } else if (data.inputMode === "script" && data.endorserLockScript) {
        // Use the provided lock script directly
        lockScript = {
          codeHash: data.endorserLockScript.codeHash,
          hashType: data.endorserLockScript.hashType as "type" | "data" | "data1",
          args: data.endorserLockScript.args
        }
        // Compute lock hash from script
        const cccScript = ccc.Script.from({
          codeHash: data.endorserLockScript.codeHash,
          hashType: data.endorserLockScript.hashType,
          args: data.endorserLockScript.args
        })
        lockHash = cccScript.hash()
      } else {
        throw new Error("Invalid endorser input")
      }

      // Add to pending changes instead of sending transaction
      setPendingEndorserChanges(prev => ({
        ...prev,
        toAdd: [...prev.toAdd, {
          endorserName: data.endorserName,
          endorserDescription: data.endorserDescription,
          endorserLockHash: lockHash,
          endorserLockScript: lockScript,
          endorserAddress: data.inputMode === "address" ? data.endorserAddress : undefined
        }]
      }))
      
      // Update pending changes indicator
      setPendingChanges(prev => ({ ...prev, endorsers: true }))
      
      endorserForm.reset()
    } catch (error) {
      console.error("Failed to add endorser:", error)
      alert("Failed to add endorser: " + (error as Error).message)
    }
  }

  const onRemoveEndorser = (index: number) => {
    if (!confirm("Are you sure you want to remove this endorser?")) {
      return
    }

    // Add to pending removals instead of sending transaction
    setPendingEndorserChanges(prev => ({
      ...prev,
      toRemove: [...prev.toRemove, index]
    }))
    
    // Update pending changes indicator
    setPendingChanges(prev => ({ ...prev, endorsers: true }))
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

    const hasChanges = pendingChanges.admins || 
                      pendingChanges.scriptCodeHashes || 
                      pendingChanges.tippingConfig ||
                      pendingChanges.endorsers

    if (!hasChanges) {
      console.warn("No pending changes detected")
      alert("No changes to update")
      return
    }

    // For endorser-only changes, protocolChanges might be null, which is OK
    const hasFormChanges = pendingChanges.admins || pendingChanges.scriptCodeHashes || pendingChanges.tippingConfig
    if (hasFormChanges && !protocolChanges) {
      console.error("No protocol changes available for form modifications")
      alert("Unable to process form changes. Please try again.")
      return
    }

    console.log("Opening confirmation dialog")
    setShowConfirmationDialog(true)
  }

  const confirmBatchUpdate = async () => {
    try {
      const batchForm: BatchUpdateProtocolForm = {}

      // Handle admin changes
      if (pendingChanges.admins && finalAdminLockHashes.length > 0) {
        batchForm.protocolConfig = {
          adminLockHashes: finalAdminLockHashes
        }
      }

      if (pendingChanges.scriptCodeHashes && formData.scriptCodeHashes) {
        batchForm.scriptCodeHashes = formData.scriptCodeHashes
      }

      if (pendingChanges.tippingConfig && formData.tippingConfig) {
        batchForm.tippingConfig = formData.tippingConfig
      }

      // Handle endorser changes
      if (pendingChanges.endorsers && (pendingEndorserChanges.toAdd.length > 0 || pendingEndorserChanges.toRemove.length > 0)) {
        batchForm.endorserOperations = {
          add: pendingEndorserChanges.toAdd.map(endorser => ({
            endorserName: endorser.endorserName,
            endorserDescription: endorser.endorserDescription,
            endorserAddress: endorser.endorserAddress || "", // Include address if available
            endorserLockScript: endorser.endorserLockScript, // Use the stored lock script
            endorserLockHash: endorser.endorserLockHash // Include the computed lock hash
          })),
          remove: pendingEndorserChanges.toRemove
        }
      }

      const txHash = await providerBatchUpdateProtocol(batchForm)
      console.log("Protocol batch updated:", txHash)
      alert(`Protocol updated successfully! Transaction: ${txHash}`)
      
      // Reset pending changes and close dialog
      setPendingChanges({
        admins: false,
        scriptCodeHashes: false,
        tippingConfig: false,
        endorsers: false
      })
      setPendingEndorserChanges({
        toAdd: [],
        toRemove: []
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

  const resetAllChanges = () => {
    if (!confirm("Are you sure you want to reset all changes? This will discard all modifications.")) {
      return
    }

    try {
      // Clear baseline values to allow proper re-initialization
      setBaselineValues({
        scriptCodeHashes: null,
        tippingConfig: null
      })
      
      // Reset all pending change states
      setPendingChanges({
        admins: false,
        scriptCodeHashes: false,
        tippingConfig: false,
        endorsers: false
      })

      // Reset admin changes
      setPendingAdminChanges({
        toAdd: [],
        toRemove: []
      })

      // Reset endorser changes
      setPendingEndorserChanges({
        toAdd: [],
        toRemove: []
      })

      // Reset form values to original state
      if (protocolData) {
        // For existing protocol data, reset to current protocol values
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
      } else if (configStatus === 'partial') {
        // For deployment mode, reset to template defaults but don't mark as changed
        scriptCodeHashesForm.reset({
          ckbBoostProtocolTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
          ckbBoostProtocolLockCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
          ckbBoostCampaignTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
          ckbBoostCampaignLockCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
          ckbBoostUserTypeCodeHash: deploymentTemplate.scriptCodeHashes.ckbBoostUserTypeCodeHash
        })
        
        tippingConfigForm.reset({
          approvalRequirementThresholds: deploymentTemplate.tippingConfig.approvalRequirementThresholds,
          expirationDuration: deploymentTemplate.tippingConfig.expirationDuration
        })
      }

      // Reset admin form
      adminForm.reset({
        inputMode: "address",
        adminAddress: "",
        adminLockHash: ""
      })

      // Reset endorser form
      endorserForm.reset()

      // Clear protocol changes
      setProtocolChanges(null)

      // Re-initialization will happen automatically via the useEffect hooks
      // when baseline values are cleared and forms are reset

      console.log("All changes have been reset")
    } catch (error) {
      console.error("Failed to reset changes:", error)
      alert("Failed to reset changes: " + (error as Error).message)
    }
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
  const handleDeployProtocol = async () => {
    if (!isWalletConnected) {
      alert("Please connect your wallet first")
      return
    }

    if (!signer) {
      alert("No signer available. Please connect your wallet.")
      return
    }

    try {
      setIsDeploying(true)
      
      // Collect form data
      const deploymentParams: DeployProtocolCellParams = {
        adminLockHashes: finalAdminLockHashes || [],
        scriptCodeHashes: scriptCodeHashesValues,
        tippingConfig: tippingConfigValues,
        initialEndorsers: pendingEndorserChanges.toAdd.map(endorser => ({
          lockHash: endorser.endorserLockHash,
          name: endorser.endorserName,
          description: endorser.endorserDescription
        }))
      }

      // Validate deployment parameters
      const validationErrors = validateDeploymentParams(deploymentParams)
      if (validationErrors.length > 0) {
        throw new Error("Validation failed:\n" + validationErrors.join("\n"))
      }

      // Deploy the protocol cell
      const result = await deployProtocolCell(signer, deploymentParams)
      
      // Store deployment result
      setDeploymentResult({
        txHash: result.txHash,
        args: result.protocolTypeScript.args
      })
      
      alert(`Protocol cell deployed successfully!\n\nTransaction: ${result.txHash}\n\nIMPORTANT: Copy the protocol cell args and update your .env.local file:\nNEXT_PUBLIC_PROTOCOL_TYPE_ARGS=${result.protocolTypeScript.args}`)
      
    } catch (error) {
      console.error("Failed to deploy protocol:", error)
      alert("Failed to deploy protocol: " + (error as Error).message)
    } finally {
      setIsDeploying(false)
    }
  }



  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Handle "Protocol cell not found" error specially - allow UI to continue
  // so that deployment form can be shown
  const isProtocolNotFoundError = error?.includes('Protocol cell not found on blockchain') || 
                                  error?.includes('No protocol cell exists on the blockchain')
  
  // Only show error page for non-protocol-not-found errors
  if (error && !isProtocolNotFoundError) {
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

  // Check wallet connection first
  if (!isWalletConnected) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-orange-600 dark:text-orange-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Wallet Connection Required</h3>
            <p className="text-muted-foreground">Please connect your wallet to access Protocol Management</p>
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
          {(pendingChanges.admins || pendingChanges.scriptCodeHashes || pendingChanges.tippingConfig || pendingChanges.endorsers) && (
            <p className="text-orange-600 text-sm font-medium mt-1">
              ⚠️ You have unsaved changes
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {configStatus === 'complete' && (
            <>
              <Button 
                onClick={toggleChangesView} 
                variant="outline"
                size="sm"
              >
                {showChangesOnly ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                {showChangesOnly ? "Show All" : "Show Changes Only"}
              </Button>
              <Button 
                onClick={resetAllChanges} 
                variant="outline"
                size="sm"
                disabled={!pendingChanges.admins && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig && !pendingChanges.endorsers}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Changes
              </Button>
              <Button 
                onClick={onBatchUpdate} 
                disabled={!pendingChanges.admins && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig && !pendingChanges.endorsers}
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
            </>
          )}
        </div>
      </div>

      {/* Protocol Deployment Check */}
      {(() => {
        const configStatus = getProtocolConfigStatus()
        
        if (configStatus === 'none') {
          return (
            <Card className="border-red-500 bg-red-50 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="flex items-center text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Protocol Contract Not Deployed
                </CardTitle>
                <CardDescription className="text-red-600 dark:text-red-400">
                  The CKBoost protocol contract (Type Script) has not been deployed on-chain yet. This is the smart contract code that defines protocol behavior.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="font-mono text-sm mb-2">1. Deploy the protocol contract on-chain:</p>
                    <code className="block bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                      # This deploys the actual smart contract code to the blockchain
                      ccc-deploy deploy generic_contract ./contracts/build/release/ckboost-protocol-type --typeId --network=testnet
                    </code>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="font-mono text-sm mb-2">2. Record the deployment in deployments.json</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">The deployment information should be automatically recorded</p>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    After deploying the contract, restart the dApp to continue.
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        }
        
        if (configStatus === 'partial') {
          return (
            <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <CardHeader>
                <CardTitle className="flex items-center text-yellow-700 dark:text-yellow-300">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Protocol Contract Deployed - Cell Creation Required
                </CardTitle>
                <CardDescription className="text-yellow-600 dark:text-yellow-400">
                  ✓ Protocol contract is deployed on-chain (type hash: {deploymentTemplate.scriptCodeHashes.ckbBoostProtocolTypeCodeHash?.slice(0, 10)}...)
                  <br />
                  ✗ No protocol cell exists yet - you need to create one to store protocol data
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
                    <h4 className="text-sm font-semibold mb-2">What's the difference?</h4>
                    <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                      <li>• <strong>Protocol Contract</strong>: The smart contract code (Type Script) deployed on-chain</li>
                      <li>• <strong>Protocol Cell</strong>: A data storage cell that uses the protocol contract and contains your protocol configuration</li>
                    </ul>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
                    To create your first protocol cell:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <li>Configure the protocol settings in the forms below</li>
                    <li>Your admin lock hash is auto-filled from your connected wallet</li>
                    <li>Set the script code hashes (use zero hashes for contracts not yet deployed)</li>
                    <li>Configure tipping settings</li>
                    <li>Click "Deploy Protocol Cell" at the bottom of the page</li>
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
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Transaction: {deploymentResult.txHash.slice(0, 10)}...
                      </p>
                      <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded">
                        <p className="text-xs font-mono">
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
          )
        }
        
        return null // configStatus === 'complete', show normal protocol management
      })()}


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
      {(protocolData || configStatus === 'partial' || isProtocolNotFoundError) && (
        <div className="space-y-6">
          {/* Admin Management - Add Admin and Current Admins */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Admin</CardTitle>
                <CardDescription>Add new administrators to the protocol</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...adminForm}>
                  <form onSubmit={adminForm.handleSubmit(onAddAdmin)} className="space-y-4">
                    <FormField
                      control={adminForm.control}
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
                              <SelectItem value="script">Lock Hash</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Choose whether to input a CKB address or lock hash directly
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    {adminForm.watch("inputMode") === "address" && (
                      <FormField
                        control={adminForm.control}
                        name="adminAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Admin Address</FormLabel>
                            <FormControl>
                              <Input placeholder="ckt1..." {...field} />
                            </FormControl>
                            <FormDescription>
                              The CKB address of the admin
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {adminForm.watch("inputMode") === "script" && (
                      <FormField
                        control={adminForm.control}
                        name="adminLockHash"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Admin Lock Hash</FormLabel>
                            <FormControl>
                              <Input placeholder="0x..." {...field} />
                            </FormControl>
                            <FormDescription>
                              The lock hash of the admin (32 bytes)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <Button type="submit" className="w-full">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Admin
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card className={pendingChanges.admins ? "border-orange-500" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  Current Admins
                  {pendingChanges.admins && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      {pendingAdminChanges.toAdd.length + pendingAdminChanges.toRemove.length} pending changes
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>Active administrators ({finalAdminLockHashes.length})</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Show pending additions */}
                  {pendingAdminChanges.toAdd.map((lockHash, index) => (
                    <div key={`pending-admin-${index}`} className="p-3 border border-green-500 rounded bg-green-50 dark:bg-green-950">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-xs break-all flex-1 min-w-0">{lockHash}</div>
                        <Badge variant="secondary" className="text-xs bg-green-600 text-white shrink-0">Pending Add</Badge>
                      </div>
                    </div>
                  ))}
                  
                  {/* Show existing admins */}
                  {protocolData && protocolData.protocol_config.admin_lock_hash_vec.map((admin: any, index: number) => {
                    const isMarkedForRemoval = pendingAdminChanges.toRemove.includes(index)
                    const adminHash = bufferToHex(admin)
                    return (
                      <div 
                        key={index} 
                        className={`p-3 border rounded ${isMarkedForRemoval ? 'border-red-500 bg-red-50 dark:bg-red-950 opacity-75' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className={`font-mono text-xs break-all flex-1 min-w-0 ${isMarkedForRemoval ? 'line-through' : ''}`}>
                            {adminHash}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isMarkedForRemoval ? (
                              <Badge variant="destructive" className="text-xs">Pending Remove</Badge>
                            ) : (
                              <Badge variant="default" className="text-xs">Active</Badge>
                            )}
                            {protocolData.protocol_config.admin_lock_hash_vec.length > 1 && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => onRemoveAdmin(index)}
                                className="text-red-600 hover:text-red-700"
                                disabled={isMarkedForRemoval}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  
                  {(!protocolData || protocolData.protocol_config.admin_lock_hash_vec.length === 0) && pendingAdminChanges.toAdd.length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      No admins configured
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

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
                <CardTitle className="flex items-center">
                  Current Endorsers
                  {pendingChanges.endorsers && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      {pendingEndorserChanges.toAdd.length + pendingEndorserChanges.toRemove.length} pending changes
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>Active endorsers ({protocolData?.endorsers_whitelist.length || 0})</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Show pending additions */}
                  {pendingEndorserChanges.toAdd.map((endorser, index) => (
                    <div key={`pending-${index}`} className="p-3 border border-green-500 rounded bg-green-50 dark:bg-green-950">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{endorser.endorserName}</div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs bg-green-600 text-white">Pending Add</Badge>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {endorser.endorserDescription}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Lock Hash:</span>{" "}
                          <span className="font-mono">{endorser.endorserLockHash}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Show existing endorsers */}
                  {protocolData && protocolData.endorsers_whitelist.map((endorser: any, index: number) => {
                    const isMarkedForRemoval = pendingEndorserChanges.toRemove.includes(index)
                    return (
                      <div 
                        key={index} 
                        className={`p-3 border rounded ${isMarkedForRemoval ? 'border-red-500 bg-red-50 dark:bg-red-950 opacity-75' : ''}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className={`font-medium ${isMarkedForRemoval ? 'line-through' : ''}`}>
                              {bufferToString(endorser.endorser_name)}
                            </div>
                            <div className="flex items-center gap-2">
                              {isMarkedForRemoval ? (
                                <Badge variant="destructive" className="text-xs">Pending Remove</Badge>
                              ) : (
                                <Badge variant="default" className="text-xs">Active</Badge>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => onRemoveEndorser(index)}
                                className="text-red-600 hover:text-red-700"
                                disabled={isMarkedForRemoval}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className={`text-sm text-muted-foreground ${isMarkedForRemoval ? 'line-through' : ''}`}>
                            {bufferToString(endorser.endorser_description)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Lock Hash:</span>{" "}
                            <span className="font-mono">{bufferToHex(endorser.endorser_lock_hash)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  
                  {(!protocolData || protocolData.endorsers_whitelist.length === 0) && pendingEndorserChanges.toAdd.length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      No endorsers configured
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Protocol Summary or Deployment Button */}
          {configStatus === 'partial' ? (
            <Card className="border-yellow-500">
              <CardHeader>
                <CardTitle className="flex items-center text-yellow-700 dark:text-yellow-300">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Ready to Deploy Protocol Cell
                </CardTitle>
                <CardDescription className="text-yellow-600 dark:text-yellow-400">
                  Review your configuration above and deploy the protocol cell when ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center gap-4">
                <Button 
                  onClick={handleDeployProtocol}
                  disabled={isDeploying || !isWalletConnected}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-8 py-3"
                  size="lg"
                >
                  {isDeploying ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Deploying Protocol Cell...
                    </>
                  ) : (
                    <>
                      <Plus className="h-5 w-5 mr-2" />
                      Deploy Protocol Cell
                    </>
                  )}
                </Button>
                <Button
                  onClick={resetAllChanges}
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
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Protocol Summary</CardTitle>
                <CardDescription>Overview of current protocol configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Last Updated</div>
                    <div className="text-muted-foreground">{protocolData ? formatTimestamp(bufferToNumber(protocolData.last_updated) * 1000) : 'N/A'}</div>
                  </div>
                  <div>
                    <div className="font-medium">Admin Addresses</div>
                    <div className="text-muted-foreground">{protocolData?.protocol_config.admin_lock_hash_vec.length || 0}</div>
                  </div>
                  <div>
                    <div className="font-medium">Active Endorsers</div>
                    <div className="text-muted-foreground">{protocolData?.endorsers_whitelist.length || 0}</div>
                  </div>
                  <div>
                    <div className="font-medium">Protocol Status</div>
                    <div className="text-muted-foreground">Active</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
                {/* Admin Changes */}
                {pendingChanges.admins && (pendingAdminChanges.toAdd.length > 0 || pendingAdminChanges.toRemove.length > 0) && (
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
                            {pendingAdminChanges.toAdd.map((lockHash, index) => (
                              <div key={index} className="font-mono text-xs">
                                + {lockHash}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pendingAdminChanges.toRemove.length > 0 && (
                        <div className="mt-2">
                          <span className="font-medium">Admins to Remove:</span>
                          <div className="mt-1 space-y-1 text-red-600">
                            {pendingAdminChanges.toRemove.map((index) => {
                              const adminHash = protocolData?.protocol_config.admin_lock_hash_vec[index] 
                                ? bufferToHex(protocolData.protocol_config.admin_lock_hash_vec[index])
                                : `Admin at index ${index}`
                              return (
                                <div key={index} className="font-mono text-xs">
                                  - {adminHash}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Script Code Hashes Changes */}
                {pendingChanges.scriptCodeHashes && protocolChanges && (
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
                {pendingChanges.tippingConfig && protocolChanges && (
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
                {/* Endorser Changes */}
                {pendingChanges.endorsers && (pendingEndorserChanges.toAdd.length > 0 || pendingEndorserChanges.toRemove.length > 0) && (
                  <div className="border rounded p-4">
                    <h4 className="font-medium mb-3 flex items-center">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Endorser Changes
                    </h4>
                    <div className="space-y-2 text-sm">
                      {pendingEndorserChanges.toAdd.length > 0 && (
                        <div>
                          <span className="font-medium">Endorsers to Add:</span>
                          <div className="mt-1 space-y-1 text-green-600">
                            {pendingEndorserChanges.toAdd.map((endorser, index) => (
                              <div key={index}>
                                + {endorser.endorserName} ({endorser.endorserLockHash.slice(0, 10)}...)
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pendingEndorserChanges.toRemove.length > 0 && (
                        <div className="mt-2">
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

            {(!pendingChanges.admins && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig && !pendingChanges.endorsers) && (
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
              disabled={!pendingChanges.admins && !pendingChanges.scriptCodeHashes && !pendingChanges.tippingConfig && !pendingChanges.endorsers}
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