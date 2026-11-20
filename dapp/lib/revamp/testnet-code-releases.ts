import { ccc } from "@ckb-ccc/core";

/** Shared public release pins; no React or wallet connector is initialized. */
export const TESTNET_CODE_RELEASES = {
  "protocol-lock": {
    name: "Protocol lock", fileName: "ckboost-protocol-lock", byteLength: 183336,
    dataHash: "0xc05104a58335932de04ddc8aaaf95f252394b1012580f3a118527400ced856c7",
  },
  "campaign-type": {
    name: "Campaign type", fileName: "ckboost-campaign-type", byteLength: 255480,
    dataHash: "0x8f47dc10346658617399a196e994aba09d1e7ed06bdb01111ac783510b17a62b",
  },
  "user-type": {
    name: "Independent User type", fileName: "ckboost-user-type", byteLength: 361256,
    dataHash: "0x76dbd826aa15708eee36d857fde53b92eb7904bfd0e6fe0ccf6d16c263bc4382",
  },
} as const;
export type TestnetCodeId = keyof typeof TESTNET_CODE_RELEASES;
export function isTestnetCodeId(value: string): value is TestnetCodeId {
  return Object.prototype.hasOwnProperty.call(TESTNET_CODE_RELEASES, value);
}
export function validateTestnetRelease(id: TestnetCodeId, bytes: Uint8Array): { dataHash: ccc.Hex; byteLength: number } {
  const expected = TESTNET_CODE_RELEASES[id];
  if (!expected) throw new Error("Unknown contract artifact.");
  if (bytes.byteLength < 64 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46 ||
    bytes[4] !== 2 || bytes[5] !== 1 || bytes[6] !== 1) throw new Error("Select an ELF64 little-endian RISC-V release binary.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint16(16, true) !== 2 || header.getUint16(18, true) !== 243 || header.getUint32(20, true) !== 1) {
    throw new Error("The ELF must be an executable for the RISC-V CKB VM.");
  }
  if (bytes.byteLength !== expected.byteLength) throw new Error(`Release size mismatch: expected ${expected.byteLength.toLocaleString("en-US")} bytes. Debug and other builds are not accepted.`);
  const dataHash = ccc.hashCkb(bytes);
  if (dataHash !== expected.dataHash) throw new Error("Release data hash mismatch. This file is not the reviewed release candidate.");
  return { dataHash, byteLength: bytes.byteLength };
}
