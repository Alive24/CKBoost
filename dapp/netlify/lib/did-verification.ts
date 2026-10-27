import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";

import { normalizeDidVerificationData } from "@/lib/identity/verification-data";
import type { DidVerificationData } from "@/lib/types/identity";
import { displayNameFromDocument } from "@/lib/vellum/dids";

export async function validateDidVerification({
  client,
  userLock,
  data,
}: {
  client: ccc.Client;
  userLock: ccc.ScriptLike;
  data: unknown;
}): Promise<DidVerificationData> {
  const normalized = normalizeDidVerificationData(data);
  if (!normalized) {
    throw new Error("The DID verification entry is malformed.");
  }

  const record = await resolveDidCkb({ client, did: normalized.did });
  if (!record) {
    throw new Error("The selected did:ckb identity is not active.");
  }

  const controller = ccc.Script.from(record.cell.cellOutput.lock);
  if (!controller.eq(ccc.Script.from(userLock))) {
    throw new Error(
      "The selected did:ckb identity is not controlled by this CKBoost user.",
    );
  }

  const displayName = displayNameFromDocument(record.data.value.document);
  if (normalized.displayName !== displayName) {
    throw new Error("The DID profile name does not match its live document.");
  }

  return displayName
    ? { did: normalized.did, displayName }
    : { did: normalized.did };
}
