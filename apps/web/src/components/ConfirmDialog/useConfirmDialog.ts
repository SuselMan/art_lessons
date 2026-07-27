import { createContext, useContext, type ReactNode } from 'react'

export interface ConfirmRequest {
  /** The question. A ReactNode so a call site can emphasise part of it. */
  message: ReactNode
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, and focus starts on Cancel instead. For actions that
   *  lose content. */
  danger?: boolean
}

export interface AlertRequest {
  message: ReactNode
  title?: string
  dismissLabel?: string
}

export interface ConfirmDialogApi {
  /** Resolves true only if the user confirmed. Cancel, ✕, Escape, a backdrop
   *  click, being pre-empted by another dialog, and the provider unmounting
   *  all resolve false — an `await` here can never hang. */
  confirm: (request: ConfirmRequest) => Promise<boolean>
  /** Blocking notice with a single dismiss button — the in-app `window.alert`. */
  alert: (request: AlertRequest) => Promise<void>
}

/** Separate from index.tsx (which exports the provider) only to keep a
 *  component file exporting components alone — Vite's fast refresh gives up on
 *  a module that mixes the two. */
export const ConfirmDialogContext = createContext<ConfirmDialogApi | null>(null)

export function useConfirmDialog(): ConfirmDialogApi {
  const api = useContext(ConfirmDialogContext)
  if (!api) throw new Error('useConfirmDialog() needs <ConfirmDialogProvider> above it (mounted in App.tsx)')
  return api
}
