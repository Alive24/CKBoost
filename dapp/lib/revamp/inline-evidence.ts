export const MAX_INLINE_EVIDENCE_BYTES = 10 * 1024 * 1024;

export type InlineEvidenceFile = {
  name: string;
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
  previewable: boolean;
};

/** Parse the bounded file envelope used in submitted responses. The envelope
 * never becomes a navigable data URL; the view creates a temporary Blob URL. */
export function decodeInlineEvidenceFile(value: string): InlineEvidenceFile | null {
  if (value.length > Math.ceil(MAX_INLINE_EVIDENCE_BYTES / 3) * 4 + 8192) return null;
  try {
    const file = JSON.parse(value) as Record<string, unknown>;
    if (file.format !== "ckboost-file" || typeof file.name !== "string" || typeof file.type !== "string" || typeof file.data_url !== "string") return null;
    const match = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(file.data_url);
    if (!match || match[1].toLowerCase() !== file.type.toLowerCase() || match[2].length % 4 !== 0) return null;
    if (match[2].length > Math.ceil(MAX_INLINE_EVIDENCE_BYTES / 3) * 4) return null;
    const binary = atob(match[2]);
    if (!binary.length || binary.length > MAX_INLINE_EVIDENCE_BYTES || file.size !== binary.length) return null;
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const mime = match[1].toLowerCase();
    const starts = (signature: readonly number[]) => signature.every((byte, index) => bytes[index] === byte);
    const previewable = (mime === "image/png" && starts([137,80,78,71,13,10,26,10]))
      || (mime === "image/jpeg" && starts([255,216,255]))
      || (mime === "image/gif" && starts([71,73,70,56]))
      || (mime === "image/webp" && starts([82,73,70,70]) && [87,69,66,80].every((byte,index) => bytes[index + 8] === byte));
    const name = file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "submitted-file";
    // Active document formats and arbitrary content remain download-only.
    return {name, bytes, mimeType: previewable ? mime : "application/octet-stream", previewable};
  } catch { return null; }
}
