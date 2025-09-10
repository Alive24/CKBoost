"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ExternalLink, MessageCircle } from "lucide-react"
import { LoginButton } from "@telegram-auth/react"

export function TelegramWidgetSection({
  walletAddress,
  open,
}: {
  walletAddress: string | null
  open: () => Promise<void> | void
}) {
  return (
    <div className="space-y-4">
      {!walletAddress && (
        <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            Please connect your wallet first to start verification
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <MessageCircle className="h-4 w-4" />
        <AlertDescription>
          Use the official Telegram Login widget below to link your Telegram account. After login, we’ll bind it to your wallet.
        </AlertDescription>
      </Alert>

      {walletAddress ? (
        <div className="flex flex-col items-center gap-3">
          <LoginButton
            botUsername={"ckboost_bot"}
            authCallbackUrl="/verify?source=telegram"
            buttonSize="large"
            cornerRadius={5}
            showAvatar={true}
            lang="en"
          />
          <Button asChild variant="outline">
            <a
              href="/verify?id=952228338&first_name=Alive24&username=Aaaaaaaalive24&photo_url=https%3A%2F%2Ft.me%2Fi%2Fuserpic%2F320%2FTNTgylEHuKsRyYCtFje_kHUSULB8C03Ou4GvzgI0eUg.jpg&auth_date=1757327119&hash=499df31299197971310af3cee1b9c69446ca505990729f9f3beb2ffd7eceb45d&source=telegram"
            >
              Mock Telegram Login
            </a>
          </Button>
        </div>
      ) : (
        <Button onClick={open} className="w-full">
          Connect Wallet to Verify
          <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      )}
    </div>
  )
}
