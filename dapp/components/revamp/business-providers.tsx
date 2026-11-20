"use client";

import type { ReactNode } from "react";
import { NostrProvider } from "@/lib/providers/nostr-provider";
import { ProtocolProvider } from "@/lib/providers/protocol-provider";

export default function RevampBusinessProviders({ children }: { children: ReactNode }) {
  return <NostrProvider><ProtocolProvider readMode="current">{children}</ProtocolProvider></NostrProvider>;
}
