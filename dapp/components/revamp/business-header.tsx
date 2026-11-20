"use client";

import { useProtocol } from "@/lib/providers/protocol-provider";
import { RevampHeaderAccount } from "./site-shell";

export default function BusinessHeader() {
  const protocol = useProtocol();
  return <RevampHeaderAccount protocolCell={protocol.protocolCell} protocolLoading={protocol.isLoading} protocolError={protocol.error} />;
}
