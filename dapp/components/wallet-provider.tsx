"use client"

import React from "react"
import { ccc } from "@ckb-ccc/connector-react"

const client = new ccc.ClientPublicTestnet()

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <ccc.Provider client={client}>
      {children}
    </ccc.Provider>
  )
}