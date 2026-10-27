import { cn } from "@/lib/utils";
import { formatDid, type ControlledDid } from "@/lib/vellum/dids";

export function DidIdentityLabel({
  identity,
  className,
}: {
  identity: ControlledDid;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex w-full min-w-0 flex-col items-start gap-0.5 text-left leading-tight",
        className,
      )}
    >
      {identity.displayName && (
        <span className="max-w-full truncate font-medium text-foreground">
          {identity.displayName}
        </span>
      )}
      <span
        className={cn(
          "max-w-full truncate font-mono text-xs",
          identity.displayName ? "text-muted-foreground" : "text-foreground",
        )}
        title={identity.did}
        aria-label={identity.did}
      >
        {formatDid(identity.did)}
      </span>
    </span>
  );
}
