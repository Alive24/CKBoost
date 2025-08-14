"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Copy, CheckCircle, AlertCircle } from "lucide-react"
import { computeLockHashFromAddress, computeLockHashWithPrefix, validateCKBAddress, formatAddressForDisplay } from "@/lib/utils/address-utils"

export function AddressHashTool() {
  // Default test address - expected lock hash: 608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a
  const [address, setAddress] = useState("ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq")
  const [lockHash, setLockHash] = useState("")
  const [lockHashWithPrefix, setLockHashWithPrefix] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [copySuccess, setCopySuccess] = useState("")

  const handleComputeHash = async () => {
    if (!address.trim()) {
      setError("Please enter a CKB address")
      return
    }

    // Validate address format
    const isValid = await validateCKBAddress(address)
    if (!isValid) {
      setError("Invalid CKB address format")
      return
    }

    setIsLoading(true)
    setError("")
    setLockHash("")
    setLockHashWithPrefix("")

    try {
      const hash = await computeLockHashFromAddress(address)
      const hashWithPrefix = await computeLockHashWithPrefix(address)
      
      setLockHash(hash)
      setLockHashWithPrefix(hashWithPrefix)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute lock hash")
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(`${type} copied!`)
      setTimeout(() => setCopySuccess(""), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>CKB Address Lock Hash Tool</CardTitle>
        <CardDescription>
          Compute the lock hash from a CKB address using the CCC library
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="address">CKB Address</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter CKB address (e.g., ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq)"
            className="font-mono text-sm"
          />
          {address && (
            <div className="text-sm text-muted-foreground">
              Display: {formatAddressForDisplay(address)}
            </div>
          )}
        </div>

        <Button 
          onClick={handleComputeHash} 
          disabled={isLoading || !address.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              Computing...
            </>
          ) : (
            "Compute Lock Hash"
          )}
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {copySuccess && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{copySuccess}</AlertDescription>
          </Alert>
        )}

        {lockHash && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lock Hash (64 characters)</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={lockHash}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(lockHash, "Lock hash")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lock Hash (with 0x prefix)</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={lockHashWithPrefix}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(lockHashWithPrefix, "Lock hash with prefix")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
              <strong>Note:</strong> The lock hash is computed from the lock script extracted from the CKB address. 
              This hash uniquely identifies the lock script and can be used for various blockchain operations.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}