export type PermissionReviewCodeId = "protocol-lock" | "campaign-type";
export interface PermissionReviewRelease {
  readonly name: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly dataHash: `0x${string}`;
}
export const PERMISSION_REVIEW_RELEASES: Readonly<Record<PermissionReviewCodeId, PermissionReviewRelease | null>>;
