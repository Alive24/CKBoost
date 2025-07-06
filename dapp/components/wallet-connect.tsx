"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Wallet, CheckCircle, Copy, ExternalLink, ChevronDown, Shield, AlertCircle, UserCheck } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

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
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [address] = useState("ckb1qyq...7x8n")
  const verificationStatus = getVerificationStatus()
  const VerificationIcon = verificationStatus.icon

  const handleConnect = async () => {
    setIsConnecting(true)
    // Simulate wallet connection delay
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsConnected(true)
    setIsConnecting(false)
  }

  const handleDisconnect = () => {
    setIsConnected(false)
  }

  const copyAddress = () => {
    navigator.clipboard.writeText("ckb1qyqd5eyygtdmwdr7ge736zw6z0ju6wsw7rshn8fcx7")
  }

  if (!isConnected) {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 bg-transparent">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="font-mono text-sm">{address}</span>
            {Object.values(USER_VERIFICATION_STATUS).some(Boolean) && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
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
          <div className="text-xs text-muted-foreground">CKB Mainnet</div>
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
        
        <DropdownMenuItem onClick={handleDisconnect} className="text-red-600">
          <Wallet className="w-4 h-4 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
