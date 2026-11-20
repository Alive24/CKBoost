import { decodeInlineEvidenceFile, MAX_INLINE_EVIDENCE_BYTES } from "../inline-evidence";

const envelope = (type: string, bytes: number[], extra: Record<string, unknown> = {}) => JSON.stringify({
  format: "ckboost-file", name: "proof.txt", type, size: bytes.length,
  data_url: `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`, ...extra,
});

describe("bounded inline evidence files", () => {
  it("keeps active document formats download-only and sanitizes file paths", () => {
    const file = decodeInlineEvidenceFile(envelope("image/svg+xml", [60,115,118,103,62], {name: "../../proof.svg"}));
    expect(file).toMatchObject({name: "proof.svg", mimeType: "application/octet-stream", previewable: false});
  });
  it("previews only supported images with a matching file signature", () => {
    expect(decodeInlineEvidenceFile(envelope("image/png", [137,80,78,71,13,10,26,10]))?.previewable).toBe(true);
    expect(decodeInlineEvidenceFile(envelope("image/png", [60,115,118,103,62]))?.previewable).toBe(false);
  });
  it("rejects incorrect sizes, data URL types and oversized envelopes", () => {
    expect(decodeInlineEvidenceFile(envelope("text/plain", [65], {size: 2}))).toBeNull();
    expect(decodeInlineEvidenceFile(envelope("text/plain", [65], {type: "image/png"}))).toBeNull();
    expect(decodeInlineEvidenceFile("x".repeat(Math.ceil(MAX_INLINE_EVIDENCE_BYTES / 3) * 4 + 8193))).toBeNull();
  });
});
