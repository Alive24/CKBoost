"use client"

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { NostrStorageModal } from "@/components/nostr-storage-modal"

type Mode = "storing" | "verifying"

type OpenArgs = {
  neventId: string
  onConfirm: () => Promise<string | void>
  onClose?: () => void
  mode?: Mode
}

type StorageModalContextType = {
  open: (args: OpenArgs) => void
  close: () => void
  isOpen: boolean
}

const StorageModalContext = createContext<StorageModalContextType | null>(null)

export function useStorageModal() {
  const ctx = useContext(StorageModalContext)
  if (!ctx) throw new Error("useStorageModal must be used within StorageModalProvider")
  return ctx
}

export function StorageModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [neventId, setNeventId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("verifying")
  const onConfirmRef = useRef<(() => Promise<string | void>) | null>(null)
  const onCloseRef = useRef<(() => void) | null>(null)

  const open = useCallback((args: OpenArgs) => {
    setNeventId(args.neventId)
    onConfirmRef.current = args.onConfirm
    onCloseRef.current = args.onClose ?? null
    setMode(args.mode || "verifying")
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    // fire last provided onClose
    try { onCloseRef.current?.() } catch {}
    // do not clear refs immediately to allow finishing renders
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!onConfirmRef.current) return undefined
    return onConfirmRef.current()
  }, [])

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen])

  return (
    <StorageModalContext.Provider value={value}>
      {children}
      <NostrStorageModal
        isOpen={isOpen}
        onClose={handleClose}
        neventId={neventId}
        onConfirm={handleConfirm}
        mode={mode}
      />
    </StorageModalContext.Provider>
  )
}
