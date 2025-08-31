"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Wallet, CheckCircle, Copy, ExternalLink, ChevronDown, Shield, AlertCircle, UserCheck, Settings, Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ccc } from "@ckb-ccc/connector-react"
import { NeventParserDialog } from "@/components/nevent-parser-dialog"
import { useProtocol } from "@/lib/providers/protocol-provider"

// Mock verification status - in real app, this would come from authentication
const USER_VERIFICATION_STATUS = {
  telegram: true,
  kyc: false,
  did: false,
  manualReview: false,
}

// Helper function to get verification status info
const getVerificationStatus = () => {
  const verificationCount = Object.values(USER_VERIFICATION_STATUS).filter(Boolean).length
  const totalVerifications = Object.values(USER_VERIFICATION_STATUS).length
  
  if (verificationCount === 0) {
    return {
      icon: UserCheck,
      color: "text-gray-600",
      bgColor: "bg-gray-100",
      text: "Unverified",
      description: "Identity not verified"
    }
  } else if (verificationCount === totalVerifications) {
    return {
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-100",
      text: "Fully Verified",
      description: "All verifications complete"
    }
  } else {
    return {
      icon: AlertCircle,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
      text: "Partially Verified",
      description: `${verificationCount} of ${totalVerifications} verifications complete`
    }
  }
}

export function WalletConnect() {
  const { open } = ccc.useCcc()
  const signer = ccc.useSigner()
  const { isAdmin, isEndorser } = useProtocol()
  const [address, setAddress] = React.useState<string>("")
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [showNeventParser, setShowNeventParser] = React.useState(false)
  const verificationStatus = getVerificationStatus()
  const VerificationIcon = verificationStatus.icon

  React.useEffect(() => {
    const getAddress = async () => {
      if (signer) {
        try {
          const addr = await signer.getRecommendedAddress()
          setAddress(addr)
        } catch (error) {
          console.error("Error getting address:", error)
        }
      } else {
        setAddress("")
      }
    }
    getAddress()
  }, [signer])

  const handleConnect = async () => {
    try {
      setIsConnecting(true)
      await open()
    } catch (error) {
      console.error("Connection failed:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    // CCC handles disconnection through the wallet interface
    await open()
  }

  const copyAddress = async () => {
    if (address) {
      navigator.clipboard.writeText(address)
    }
  }

  const formatAddress = (addr: string) => {
    if (!addr) return "ckb1qyq...7x8n"
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  if (!signer) {
    return (
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        variant="outline"
        className="flex items-center gap-2 bg-transparent"
      >
        {isConnecting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </>
        )}
      </Button>
    )
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 bg-transparent">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="font-mono text-sm">{formatAddress(address)}</span>
            {Object.values(USER_VERIFICATION_STATUS).some(Boolean) && (
              <Badge variant="secondary" className={cn("text-xs", 
                Object.values(USER_VERIFICATION_STATUS).filter(Boolean).length === Object.values(USER_VERIFICATION_STATUS).length
                  ? "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100"
                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100"
              )}>
                <Shield className="w-3 h-3 mr-1" />
                {getVerificationStatus().text}
              </Badge>
            )}
          </div>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {/* Wallet Info */}
        <div className="px-3 py-2 border-b">
          <div className="text-sm font-medium">Wallet Connected</div>
          <div className="text-xs text-muted-foreground">CKB Testnet</div>
        </div>
        
        {/* Verification Status */}
        <div className="px-3 py-2 border-b">
          <div className="flex items-center gap-2 mb-1">
            <VerificationIcon className={cn("w-4 h-4", verificationStatus.color)} />
            <span className="text-sm font-medium">Identity Status</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className={cn("text-sm font-medium", verificationStatus.color)}>
                {verificationStatus.text}
              </div>
              <div className="text-xs text-muted-foreground">
                {verificationStatus.description}
              </div>
            </div>
            {Object.values(USER_VERIFICATION_STATUS).filter(Boolean).length < Object.values(USER_VERIFICATION_STATUS).length && (
              <Link href="/verify">
                <Button size="sm" variant="outline" className="text-xs">
                  Verify
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Wallet Actions */}
        <DropdownMenuItem onClick={copyAddress}>
          <Copy className="w-4 h-4 mr-2" />
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ExternalLink className="w-4 h-4 mr-2" />
          View on Explorer
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Verification Actions */}
        <DropdownMenuItem asChild>
          <Link href="/verify" className="w-full">
            <Shield className="w-4 h-4 mr-2" />
            Manage Identity
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Campaign Admin - Visible to endorsers and admins */}
        {(isEndorser || isAdmin) && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/campaign-admin" className="w-full">
                <Settings className="w-4 h-4 mr-2" />
                Campaign Admin
              </Link>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
          </>
        )}
        
        {/* Platform Admin Tools - Only visible to platform admins */}
        {isAdmin && (
          <>
            {/* Tools */}
            <DropdownMenuItem onClick={() => setShowNeventParser(true)}>
              <Search className="w-4 h-4 mr-2" />
              Parse Nevent Submission
            </DropdownMenuItem>
            
            {/* Platform Admin */}
            <DropdownMenuItem asChild>
              <Link href="/platform-admin" className="w-full">
                <Shield className="w-4 h-4 mr-2" />
                Platform Admin
              </Link>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem onClick={handleDisconnect} className="text-red-600">
          <Wallet className="w-4 h-4 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    
    {/* Nevent Parser Dialog */}
    <NeventParserDialog 
      open={showNeventParser} 
      onOpenChange={setShowNeventParser} 
    />
    </>
  )
}