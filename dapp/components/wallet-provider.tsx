"use client"

import React from "react"
import { ccc } from "@ckb-ccc/connector-react"
import { getIsolatedRuntime } from "@/lib/ckb/isolated-runtime.mjs"

const isolated = getIsolatedRuntime()
const client = isolated ? new ccc.ClientPublicTestnet({url:isolated.rpcUrl,timeout:12000}) : new ccc.ClientPublicTestnet()

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <ccc.Provider defaultClient={client}>
      {children}
    </ccc.Provider>
  )
}
