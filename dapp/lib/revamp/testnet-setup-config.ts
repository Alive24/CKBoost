/** Server-safe gate: importing it must not initialize the wallet connector. */
export function isTestnetSetupEnabled(enabled: string | undefined, network: string | undefined): boolean {
  return enabled === "1" && network !== "mainnet";
}
