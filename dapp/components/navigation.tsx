"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { WalletConnect } from "@/components/wallet-connect"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Home, Trophy, MessageSquare, Menu, X, Settings, Shield, CheckCircle2, AlertCircle, UserCheck } from "lucide-react"

// Mock user role and verification status - in real app, this would come from authentication
const USER_ROLE: "user" | "campaign_admin" | "platform_admin" | "both" = "both"
const USER_VERIFICATION_STATUS: "unverified" | "pending" | "verified" | "rejected" = "verified"

// Helper function to check user permissions
const hasPermission = (permission: "campaign_admin" | "platform_admin") => {
  if (USER_ROLE === "both") return true
  return USER_ROLE === permission
}

const NAVIGATION_ITEMS = [
  {
    name: "Campaigns",
    href: "/",
    icon: Trophy,
  },
  {
    name: "Leaderboard",
    href: "/leaderboard",
    icon: Trophy,
  },
  {
    name: "Tipping",
    href: "/tipping",
    icon: MessageSquare,
  },
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },
]

// Add admin navigation items based on user role
const ADMIN_ITEMS = []
if (hasPermission("campaign_admin")) {
  ADMIN_ITEMS.push({
    name: "Campaign Admin",
    href: "/admin",
    icon: Settings,
  })
}
if (hasPermission("platform_admin")) {
  ADMIN_ITEMS.push({
    name: "Platform Admin",
    href: "/platform-admin",
    icon: Shield,
  })
}

const ALL_NAVIGATION_ITEMS = [...NAVIGATION_ITEMS, ...ADMIN_ITEMS]

// Helper function to get verification status info
const getVerificationStatus = () => {
  if (USER_VERIFICATION_STATUS === "verified") {
    return {
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-100",
      text: "Verified",
      description: "Identity verified"
    }
  }
  if (USER_VERIFICATION_STATUS === "pending") {
    return {
      icon: AlertCircle,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
      text: "Pending",
      description: "Verification in progress"
    }
  }
  if (USER_VERIFICATION_STATUS === "rejected") {
    return {
      icon: AlertCircle,
      color: "text-red-600",
      bgColor: "bg-red-100",
      text: "Rejected",
      description: "Verification rejected"
    }
  }
  return {
    icon: UserCheck,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    text: "Unverified",
    description: "Identity not verified"
  }
}

export function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const verificationStatus = getVerificationStatus()
  const VerificationIcon = verificationStatus.icon

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              CKBoost
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {ALL_NAVIGATION_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-purple-100 text-purple-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* Desktop Verification Status & Wallet */}
          <div className="hidden md:flex items-center gap-4">
            {/* Verification Status */}
            <Link href="/verify" className="flex items-center gap-2 group">
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                pathname === "/verify" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
              )}>
                <VerificationIcon className={cn("w-4 h-4", verificationStatus.color)} />
                <span className="text-sm font-medium">{verificationStatus.text}</span>
                {USER_VERIFICATION_STATUS === "verified" && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                    ✓
                  </Badge>
                )}
              </div>
            </Link>

            {/* Wallet Connect */}
            <WalletConnect />
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <div className="space-y-2">
              {ALL_NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-purple-100 text-purple-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                    )}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
              
              {/* Mobile Verification Status */}
              <Link
                href="/verify"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === "/verify" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <VerificationIcon className={cn("w-4 h-4", verificationStatus.color)} />
                <span>Identity Verification</span>
                {USER_VERIFICATION_STATUS === "verified" && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs ml-auto">
                    ✓
                  </Badge>
                )}
              </Link>
              
              <div className="pt-4 border-t border-gray-200">
                <WalletConnect />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
