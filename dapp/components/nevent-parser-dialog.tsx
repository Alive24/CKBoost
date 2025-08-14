"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, Search, Copy, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useNostrFetch } from '@/hooks/use-nostr-fetch'

interface NeventParserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NeventParserDialog({ open, onOpenChange }: NeventParserDialogProps) {
  const [neventId, setNeventId] = useState<string>('')
  const [submission, setSubmission] = useState<any>(null)
  const [copied, setCopied] = useState<string>('')
  const { fetchSubmission, isLoading, error: fetchError } = useNostrFetch()
  const [localError, setLocalError] = useState<string>('')

  const handleParse = async () => {
    if (!neventId.trim()) {
      setLocalError('Please enter a nevent ID')
      return
    }

    setLocalError('')
    setSubmission(null)

    const result = await fetchSubmission(neventId)
    
    if (result) {
      setSubmission(result)
    } else if (fetchError) {
      setLocalError(fetchError)
    }
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(field)
      setTimeout(() => setCopied(''), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const truncateHash = (hash: string) => {
    if (!hash) return ''
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`
  }

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setNeventId('')
      setSubmission(null)
      setLocalError('')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Parse Nostr Submission</DialogTitle>
          <DialogDescription>
            Parse quest submissions stored on Nostr using their nevent ID
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {/* Input Section */}
          <div className="space-y-2">
            <Label htmlFor="nevent-input">Nevent ID</Label>
            <div className="flex gap-2">
              <Input
                id="nevent-input"
                type="text"
                placeholder="nevent1..."
                value={neventId}
                onChange={(e) => setNeventId(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button 
                onClick={handleParse} 
                disabled={isLoading}
                size="sm"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    Parsing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Parse
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Error Alert */}
          {(localError || fetchError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{localError || fetchError}</AlertDescription>
            </Alert>
          )}

          {/* Parsed Submission Display */}
          {submission && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold">Submission Details</h3>
              
              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Campaign Type Hash</Label>
                  <div className="flex items-center gap-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {truncateHash(submission.campaignTypeHash)}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(submission.campaignTypeHash, 'campaign')}
                    >
                      {copied === 'campaign' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Quest ID</Label>
                  <Badge variant="secondary" className="text-xs">
                    Quest #{submission.questId}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">User Address</Label>
                  <div className="flex items-center gap-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {truncateHash(submission.userAddress)}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(submission.userAddress, 'user')}
                    >
                      {copied === 'user' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Submission Time</Label>
                  <p className="text-xs">{formatDate(submission.timestamp)}</p>
                </div>
              </div>

              {/* Submission Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Submission Content</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(submission.content, 'content')}
                  >
                    {copied === 'content' ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <Textarea
                  value={submission.content}
                  readOnly
                  className="min-h-[150px] font-mono text-xs"
                />
              </div>

              {/* Relays */}
              {submission.relays.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Nostr Relays</Label>
                  <div className="flex flex-wrap gap-1">
                    {submission.relays.map((relay, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {relay}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}