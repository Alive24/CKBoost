"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, CheckCircle, XCircle, RefreshCw, ExternalLink, Cloud, AlertTriangle, Code, Eye, Copy } from "lucide-react"
import { useNostrFetch } from "@/hooks/use-nostr-fetch"
import { debug } from "@/lib/utils/debug"

interface NostrStorageModalProps {
  isOpen: boolean
  onClose: () => void
  neventId: string | null
  onConfirm: () => Promise<void>
  mode: "storing" | "verifying"
}

export function NostrStorageModal({ 
  isOpen, 
  onClose, 
  neventId,
  onConfirm,
  mode
}: NostrStorageModalProps) {
  const { fetchSubmission } = useNostrFetch()
  const [status, setStatus] = useState<"storing" | "verifying" | "success" | "error">("storing")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [verifiedContent, setVerifiedContent] = useState<string>("")
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [txStatus, setTxStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle")
  const [txError, setTxError] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus(mode === "storing" ? "storing" : "verifying")
      setErrorMessage("")
      setVerifiedContent("")
      setRetryCount(0)
    }
  }, [isOpen, mode])

  // Start verification when we have a nevent ID
  useEffect(() => {
    if (isOpen && neventId && mode === "verifying") {
      verifyStorage()
    }
  }, [isOpen, neventId, mode])

  const verifyStorage = async () => {
    if (!neventId) return

    setStatus("verifying")
    setErrorMessage("")
    
    try {
      debug.log("Verifying Nostr storage for:", neventId)
      
      // Try to fetch the submission from Nostr
      const result = await fetchSubmission(neventId)
      
      if (result && result.content) {
        debug.log("✅ Successfully retrieved content from Nostr")
        setVerifiedContent(result.content)
        setStatus("success")
      } else {
        throw new Error("Content could not be retrieved from Nostr relays")
      }
    } catch (err) {
      debug.error("Failed to verify Nostr storage:", err)
      setErrorMessage(err instanceof Error ? err.message : "Failed to retrieve content from Nostr")
      setStatus("error")
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    setRetryCount(prev => prev + 1)
    
    // Wait a bit before retrying to allow propagation
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    await verifyStorage()
    setIsRetrying(false)
  }

  const handleConfirm = async () => {
    if (status !== "success") {
      setErrorMessage("Please verify storage before proceeding")
      return
    }

    setIsConfirming(true)
    setTxStatus("submitting")
    setTxError(null)
    
    try {
      await onConfirm()
      setTxStatus("submitted")
      // Don't close modal immediately - let user see the status
      // User can manually close or refresh the page
    } catch (err) {
      debug.error("Failed to confirm transaction:", err)
      const errorMsg = err instanceof Error ? err.message : "Failed to submit transaction"
      setTxError(errorMsg)
      setTxStatus("error")
      setErrorMessage(errorMsg)
    } finally {
      setIsConfirming(false)
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case "storing":
      case "verifying":
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case "storing":
        return "Storing content on Nostr network..."
      case "verifying":
        return "Verifying content is accessible..."
      case "success":
        return "Content successfully stored and verified!"
      case "error":
        return "Failed to verify storage"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            Nostr Storage Verification
          </DialogTitle>
          <DialogDescription>
            Ensuring your submission is safely stored on the decentralized network before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <div className="flex-1">
                  <p className="font-medium">{getStatusText()}</p>
                  {retryCount > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Retry attempt: {retryCount}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Nevent ID Display */}
          {neventId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Event ID:</label>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded flex-1 overflow-x-auto">
                  {neventId}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(neventId)}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          {/* Success Content Preview */}
          {status === "success" && verifiedContent && (
            <>
              <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  ✅ Content verified! Your submission has been successfully stored and retrieved from Nostr.
                </AlertDescription>
              </Alert>

              {/* Content Preview Tabs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Content Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="rendered" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="rendered">
                        <Eye className="w-4 h-4 mr-2" />
                        Rendered
                      </TabsTrigger>
                      <TabsTrigger value="json">
                        <Code className="w-4 h-4 mr-2" />
                        Raw JSON
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="rendered" className="mt-4">
                      <div className="border rounded-lg p-4 max-h-96 overflow-y-auto bg-white dark:bg-gray-900 space-y-4">
                        {(() => {
                          // Parse content to extract subtasks
                          const subtaskSections = verifiedContent.split(/<h3>/).filter(Boolean);
                          
                          if (subtaskSections.length > 1) {
                            // Content has subtask headers, render them separately
                            return subtaskSections.map((section, index) => {
                              // Re-add the h3 tag that was removed by split
                              const fullSection = `<h3>${section}`;
                              // Extract the title from the h3 tag
                              const titleMatch = section.match(/^([^<]*)</);
                              const title = titleMatch ? titleMatch[1] : `Subtask ${index + 1}`;
                              
                              return (
                                <div key={index} className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
                                  <div className="mb-2 pb-2 border-b">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                      {title}
                                    </span>
                                  </div>
                                  <div 
                                    className="prose prose-sm dark:prose-invert max-w-none"
                                    dangerouslySetInnerHTML={{ 
                                      __html: fullSection.replace(/<h3>([^<]*)<\/h3>/, '') // Remove the h3 from content since we show it above
                                    }}
                                  />
                                </div>
                              );
                            });
                          } else {
                            // No subtasks found, render as single content
                            return (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <div 
                                  dangerouslySetInnerHTML={{ 
                                    __html: verifiedContent 
                                  }}
                                />
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="json" className="mt-4">
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 z-10"
                          onClick={() => {
                            // Parse subtasks for JSON view too
                            const subtaskSections = verifiedContent.split(/<h3>/).filter(Boolean);
                            const subtasks = subtaskSections.length > 1 
                              ? subtaskSections.map((section, index) => {
                                  const titleMatch = section.match(/^([^<]*)</);
                                  const title = titleMatch ? titleMatch[1] : `Subtask ${index + 1}`;
                                  const content = `<h3>${section}`;
                                  return { title, content };
                                })
                              : [{ title: "Full Content", content: verifiedContent }];
                            
                            navigator.clipboard.writeText(JSON.stringify({
                              eventId: neventId,
                              timestamp: new Date().toISOString(),
                              subtasks: subtasks
                            }, null, 2))
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <pre className="border rounded-lg p-4 max-h-96 overflow-auto bg-gray-50 dark:bg-gray-900 text-xs">
                          <code>
{JSON.stringify({
  eventId: neventId,
  timestamp: new Date().toISOString(),
  subtasks: (() => {
    const subtaskSections = verifiedContent.split(/<h3>/).filter(Boolean);
    return subtaskSections.length > 1 
      ? subtaskSections.map((section, index) => {
          const titleMatch = section.match(/^([^<]*)</);
          const title = titleMatch ? titleMatch[1] : `Subtask ${index + 1}`;
          return { 
            title, 
            content: `<h3>${section}`.substring(0, 200) + (section.length > 200 ? '...' : '')
          };
        })
      : [{ title: "Full Content", content: verifiedContent.substring(0, 200) + (verifiedContent.length > 200 ? '...' : '') }];
  })()
}, null, 2)}
                          </code>
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}

          {/* Transaction Status Display */}
          {txStatus !== "idle" && (
            <Card className={
              txStatus === "submitted" ? "border-green-200 dark:border-green-800" :
              txStatus === "error" ? "border-red-200 dark:border-red-800" :
              "border-blue-200 dark:border-blue-800"
            }>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {txStatus === "submitting" && (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting Transaction...
                    </>
                  )}
                  {txStatus === "submitted" && (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Transaction Submitted!
                    </>
                  )}
                  {txStatus === "error" && (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      Transaction Failed
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {txStatus === "submitted" && (
                  <div className="space-y-3">
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Your quest submission has been successfully sent to the blockchain!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The transaction has been submitted. You can refresh the page to see your submission.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => window.location.reload()}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Refresh Page
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={onClose}
                      >
                        Close Dialog
                      </Button>
                    </div>
                  </div>
                )}
                {txStatus === "error" && txError && (
                  <div className="space-y-2">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {txError}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Please try again or contact support if the issue persists.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {status === "error" && txStatus === "idle" && (
            <Alert className="border-red-200 bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                {errorMessage}
                <div className="mt-2 text-sm">
                  This may be due to:
                  <ul className="list-disc list-inside mt-1">
                    <li>Slow relay propagation (try waiting a moment)</li>
                    <li>Relay connection issues</li>
                    <li>Event not accepted by relays</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* External Links */}
          {neventId && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  External Viewers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 dark:bg-green-900/20"
                    onClick={() => window.open(`https://njump.me/${neventId}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    njump.me (Recommended)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`https://nostrudel.ninja/#/n/${neventId}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Nostrudel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`https://snort.social/e/${neventId}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Snort
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`https://nostr.band/?q=${neventId}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    nostr.band
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  njump.me is most reliable for viewing events. If one viewer doesn't work, try another.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isConfirming || isRetrying || txStatus === "submitting"}
          >
            {txStatus === "submitted" ? "Close" : "Cancel"}
          </Button>
          
          {status === "error" && (
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Verification
                </>
              )}
            </Button>
          )}

          {status === "success" && txStatus !== "submitted" && (
            <Button
              onClick={handleConfirm}
              disabled={isConfirming || txStatus === "submitting"}
              className="bg-green-600 hover:bg-green-700"
            >
              {isConfirming || txStatus === "submitting" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting Transaction...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm & Submit to Blockchain
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}