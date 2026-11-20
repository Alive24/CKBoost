import { ccc } from "@ckb-ccc/core";
import { PERMISSION_REVIEW_RELEASES, type PermissionReviewCodeId } from "../ckb/permissions-release-pins.mjs";

export const PERMISSION_UPGRADE_IDS = ["protocol-lock", "campaign-type"] as const;
/** Pure binary validation, shared with the Node-only release route. */
export function validatePermissionRelease(id: PermissionReviewCodeId, bytes: Uint8Array) {
  const pin = PERMISSION_REVIEW_RELEASES[id];
  if (!pin) throw new Error("The permissions release has not been pinned.");
  if (bytes.byteLength < 64 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46 || bytes[4] !== 2 || bytes[5] !== 1 || bytes[6] !== 1) throw new Error("Expected the reviewed ELF64 little-endian release.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint16(16, true) !== 2 || header.getUint16(18, true) !== 243 || header.getUint32(20, true) !== 1) throw new Error("Expected a RISC-V CKB executable.");
  if (bytes.byteLength !== pin.byteLength || ccc.hashCkb(bytes) !== pin.dataHash) throw new Error("The release size or CKB data hash does not match the reviewed permissions build.");
  return pin;
}
