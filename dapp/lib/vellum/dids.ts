import { ccc } from "@ckb-ccc/core";
import { listDidCkbsByLock } from "@ckb-ccc/did-ckb";

export type ControllerLock = {
  args: string;
  codeHash: string;
  hashType: "data" | "data1" | "data2" | "type";
};

export async function listControlledDids(
  lock: ControllerLock,
): Promise<string[]> {
  const network = process.env.NEXT_PUBLIC_CKB_NETWORK ?? "testnet";
  if (network !== "testnet") {
    throw new Error("Portable quest claims are available on CKB Testnet only.");
  }
  const client = new ccc.ClientPublicTestnet({
    url: process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev",
    fallbacks: [],
    timeout: 10_000,
  });
  const records = await listDidCkbsByLock({
    client,
    lock: ccc.Script.from(lock),
  });
  return records.map(({ did }) => did).sort();
}
