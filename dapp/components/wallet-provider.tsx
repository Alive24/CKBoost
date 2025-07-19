"use client"

import React from "react"
import { ccc } from "@ckb-ccc/connector-react"

const client = new ccc.ClientPublicTestnet()

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <ccc.Provider defaultClient={client}>
      {children}
    </ccc.Provider>
  )
}