export class CreationDeploymentCapabilityError extends Error {
  readonly code="ORGANIZER_AUTH_UPGRADE_REQUIRED";
  constructor(message="Organizer access is confirmed. Editing this campaign requires a protocol authorization upgrade before it can be published."){super(message);this.name="CreationDeploymentCapabilityError";}
}

export function parseCreationAuthLockHashes(raw:string|undefined):ReadonlySet<string> {
  if(!raw?.trim())return new Set();
  if(raw.length>16384)throw new CreationDeploymentCapabilityError("Organizer access is confirmed, but the upgraded protocol-lock configuration is invalid. Ask the platform admin to check the deployment configuration.");
  const values=raw.trim().split(/[\s,]+/);
  if(values.some(value=>!/^0x[0-9a-f]{64}$/i.test(value)))throw new CreationDeploymentCapabilityError("Organizer access is confirmed, but the upgraded protocol-lock configuration contains an invalid hash. Ask the platform admin to check the deployment configuration.");
  return new Set(values.map(value=>value.toLowerCase()));
}

/** A source-code fix is not evidence that the input lock was upgraded on-chain.
 * Admin's existing deployment path is unaffected. No placeholder hashes ship. */
export function assertCreationEditDeployment(admin:boolean,inputLockCodeHash:string,raw=process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES):void {
  if(admin)return;
  if(!parseCreationAuthLockHashes(raw).has(inputLockCodeHash.toLowerCase()))throw new CreationDeploymentCapabilityError();
}
