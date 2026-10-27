"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ccc } from "@ckb-ccc/connector-react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/lib/providers/user-provider";
import type { DidVerificationData } from "@/lib/types/identity";
import { listControlledDids, type ControlledDid } from "@/lib/vellum/dids";
import { DidIdentityLabel } from "./DidIdentityLabel";

const explorerBaseUrl =
  process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet"
    ? "https://explorer.nervos.org/transaction/"
    : "https://pudge.explorer.nervos.org/transaction/";

export function DidBindingCard({
  currentDid,
  isVerified,
  isStatusLoading,
  onUpdated,
}: {
  currentDid?: DidVerificationData;
  isVerified: boolean;
  isStatusLoading: boolean;
  onUpdated: () => Promise<void>;
}) {
  const signer = ccc.useSigner();
  const { open } = ccc.useCcc();
  const { userService, refreshUserData } = useUser();
  const [controlledDids, setControlledDids] = useState<ControlledDid[]>([]);
  const [selectedDid, setSelectedDid] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<ccc.Hex | null>(null);

  const loadControlledDids = useCallback(async () => {
    if (!signer) {
      setControlledDids([]);
      setSelectedDid("");
      setLoadError(null);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const address = await signer.getRecommendedAddressObj();
      const identities = await listControlledDids({
        codeHash: address.script.codeHash,
        hashType: address.script.hashType,
        args: address.script.args,
      });
      setControlledDids(identities);
      setSelectedDid((selection) => {
        if (identities.some(({ did }) => did === selection)) return selection;
        if (identities.some(({ did }) => did === currentDid?.did)) {
          return currentDid!.did;
        }
        return identities[0]?.did ?? "";
      });
    } catch (error) {
      setControlledDids([]);
      setSelectedDid("");
      setLoadError(
        error instanceof Error
          ? error.message
          : "Your Vellum identities could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentDid?.did, signer]);

  useEffect(() => {
    void loadControlledDids();
  }, [loadControlledDids]);

  const selectedIdentity = useMemo(
    () => controlledDids.find(({ did }) => did === selectedDid),
    [controlledDids, selectedDid],
  );
  const currentIdentity = useMemo(
    () =>
      controlledDids.find(({ did }) => did === currentDid?.did) ?? currentDid,
    [controlledDids, currentDid],
  );
  const showSelector = !currentDid || !isVerified || isEditing;
  const selectionIsCurrent = selectedDid === currentDid?.did && isVerified;
  const profileChanged =
    selectionIsCurrent &&
    selectedIdentity?.displayName !== currentDid?.displayName;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedIdentity || !userService || !signer) return;

    setIsSaving(true);
    setSaveError(null);
    setStatusMessage(null);
    setPendingTxHash(null);
    try {
      const txHash = await userService.updateDidVerification(selectedIdentity);
      setPendingTxHash(txHash);
      setStatusMessage("Preferred DID submitted. Waiting for confirmation...");

      try {
        await signer.client.waitTransaction(txHash, 0, 5 * 60 * 1000, 2000);
      } catch {
        setStatusMessage(
          "Preferred DID submitted. Confirmation is still pending on CKB Testnet.",
        );
        return;
      }

      await Promise.all([refreshUserData(), onUpdated()]);
      setStatusMessage("Preferred DID connected to your CKBoost profile.");
      setIsEditing(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The preferred DID could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      className={isVerified ? "border-indigo-300 dark:border-indigo-800" : ""}
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Fingerprint
              className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">Vellum DID</CardTitle>
              <CardDescription>
                Choose the identity CKBoost displays and uses for portable quest
                claims.
              </CardDescription>
            </div>
          </div>
          <Badge variant={isVerified ? "secondary" : "outline"}>
            {isVerified ? "Connected" : currentDid ? "Reconnect" : "Available"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!signer ? (
          <div className="space-y-3">
            <Alert>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                Connect the wallet that controls your Vellum DID.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              className="w-full"
              onClick={() => void open()}
            >
              Connect wallet
            </Button>
          </div>
        ) : isLoading || isStatusLoading ? (
          <div className="space-y-3" aria-label="Loading Vellum identities">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="space-y-3">
              <p>{loadError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadControlledDids()}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : controlledDids.length === 0 ? (
          <div className="space-y-3">
            <Alert>
              <Fingerprint className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                This wallet does not control an active Vellum DID yet.
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline" className="w-full">
              <a
                href="https://dashboard.usevellum.xyz/identity"
                target="_blank"
                rel="noreferrer"
              >
                Create a Vellum DID
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        ) : (
          <>
            {currentDid && isVerified && !isEditing && currentIdentity && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 px-3 py-3">
                  <DidIdentityLabel identity={currentIdentity} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {controlledDids.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSaveError(null);
                        setStatusMessage(null);
                        setIsEditing(true);
                      }}
                    >
                      Change preferred DID
                    </Button>
                  )}
                  {currentIdentity.displayName !== currentDid.displayName && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      Refresh profile name
                    </Button>
                  )}
                </div>
              </div>
            )}

            {showSelector && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="preferred-vellum-did">
                    Preferred identity
                  </Label>
                  <Select value={selectedDid} onValueChange={setSelectedDid}>
                    <SelectTrigger
                      id="preferred-vellum-did"
                      className="h-auto min-h-14 py-2 [&>span]:line-clamp-none"
                    >
                      <SelectValue placeholder="Select a Vellum DID">
                        {selectedIdentity && (
                          <DidIdentityLabel identity={selectedIdentity} />
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {controlledDids.map((identity) => (
                        <SelectItem
                          key={identity.did}
                          value={identity.did}
                          className="py-2.5"
                        >
                          <DidIdentityLabel identity={identity} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Saving requires a CKB transaction. CKBoost verifies that
                    this wallet controls the selected DID before signing it.
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  {isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => {
                        setSelectedDid(currentDid?.did ?? "");
                        setIsEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={
                      !selectedIdentity ||
                      !userService ||
                      isSaving ||
                      (selectionIsCurrent && !profileChanged)
                    }
                    aria-busy={isSaving}
                  >
                    {isSaving && (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {isSaving
                      ? "Saving preferred DID..."
                      : currentDid
                        ? profileChanged
                          ? "Refresh DID profile"
                          : "Update preferred DID"
                        : "Connect preferred DID"}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}

        {saveError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        {statusMessage && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="space-y-1">
              <p aria-live="polite">{statusMessage}</p>
              {pendingTxHash && (
                <a
                  className="inline-flex min-h-10 items-center font-medium underline underline-offset-4"
                  href={`${explorerBaseUrl}${pendingTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                  <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
