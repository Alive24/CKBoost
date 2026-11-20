import { ccc } from "@ckb-ccc/shell";
import { CampaignData, ConnectedTypeID, ProtocolData } from "ssri-ckboost/types";
import { verifyCampaignOwnership } from "../../lib/revamp/campaign-permissions";

const hex = (value: ccc.HexLike): string => ccc.hexFrom(value).toLowerCase();

/** CCC private-key signers also recognize related AnyoneCanPay locks. Do not
 * let the proxy produce a second wallet's apparent reviewer signature, or
 * authorize any other server-controlled lock group while co-signing. */
export async function assertCanonicalProxySigningScope(signer: Pick<ccc.SignerCkbPrivateKey, "getRelatedScripts">, tx: ccc.Transaction, canonicalLockHash: string): Promise<void> {
  const related = await signer.getRelatedScripts(tx);
  if (related.length !== 1 || hex(related[0].script.hash()) !== hex(canonicalLockHash as ccc.Hex)) {
    throw new Error("The proxy may sign only its canonical authentication lock group.");
  }
}

/** The proxy's own input is public and cannot prove who requested a signature.
 * Require a distinct authorized wallet input in the same raw transaction. Its
 * lock must still be satisfied on chain; the proxy signature commits to that
 * input, so it cannot be removed from the returned transaction. Call only after
 * hydrating every input from the chain, never from request-supplied cell data. */
export async function authorizeStaffProxyTransaction({client, tx, campaignCell, protocolTypeHash, protocolTypeScript, proxyLockHash}: {
  client: ccc.Client;
  tx: ccc.Transaction;
  /** The actual selected transaction input, hydrated from the public chain. */
  campaignCell: ccc.CellInput;
  protocolTypeHash: string;
  protocolTypeScript: ccc.ScriptLike;
  proxyLockHash: string;
}): Promise<{actorLockHashes: string[]}> {
  // Deliberately bypass the Netlify protocol-cell cache for authorization.
  const cells = client.findCells({script: protocolTypeScript, scriptType: "type", scriptSearchMode: "exact", withData: true});
  let cell: ccc.Cell | undefined;
  try { cell = (await cells.next()).value; }
  finally { await cells.return?.(undefined); }
  if (!cell?.cellOutput.type || !cell.cellOutput.type.eq(ccc.Script.from(protocolTypeScript)) ||
    hex(cell.cellOutput.type.hash()) !== hex(protocolTypeHash as ccc.Hex)) {
    throw new Error("The campaign is not connected to the current configured protocol.");
  }
  const protocol = ProtocolData.decode(cell.outputData);
  if (!tx.inputs.includes(campaignCell) || !campaignCell.cellOutput?.type || campaignCell.outputData === undefined) {
    throw new Error("An authoritative hydrated campaign input is required.");
  }
  const connection = ConnectedTypeID.decode(campaignCell.cellOutput.type.args);
  if (ccc.hexFrom(ConnectedTypeID.encode(connection)) !== campaignCell.cellOutput.type.args) throw new Error("Campaign review arguments are not canonical.");
  const ownership = verifyCampaignOwnership({
    campaignTypeId: ccc.hexFrom(connection.type_id), protocolTypeHash,
    campaignTypeCodeHash: ccc.hexFrom(protocol.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),
    protocolLockCodeHash: ccc.hexFrom(protocol.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
    protocolLockHashType: cell.cellOutput.lock.hashType,
    cell: {cellOutput: {type: campaignCell.cellOutput.type, lock: campaignCell.cellOutput.lock}},
  });
  if (!ownership) throw new Error("Campaign review input ownership, code or protocol binding is invalid.");
  // Only INPUT assignments count. Desired output metadata cannot grant a role.
  const campaign = CampaignData.decode(campaignCell.outputData);
  const admins = protocol.protocol_config.admin_lock_hash_vec.map(hash => hex(hash));
  const proxy = hex(proxyLockHash as ccc.Hex);
  if (!admins.includes(proxy)) throw new Error("The approval proxy is not a current platform administrator.");
  // signTransaction signs every input in the proxy's lock group. An extra
  // proxy-owned token or data cell must never hitchhike on an approval request.
  const proxyInputs = tx.inputs.filter(input => input.cellOutput && hex(input.cellOutput.lock.hash()) === proxy);
  if (proxyInputs.length !== 1 || proxyInputs[0].cellOutput!.type || proxyInputs[0].outputData !== "0x") {
    throw new Error("Only one plain empty proxy authentication input may be co-signed.");
  }
  const organizers = protocol.endorsers_whitelist.map(value => hex(value.endorser_lock_hash));
  const owner = hex(ownership.ownerLockHash as ccc.Hex);
  const authorized = new Set([...admins, ...campaign.staff_lock_hash_vec.map(hash => hex(hash)), ...(organizers.includes(owner) ? [owner] : [])]);
  const spendsOwnCapacity = (lockHash: string) => {
    const inputCapacity = tx.inputs.reduce((total, input) => total + (input.cellOutput && hex(input.cellOutput.lock.hash()) === lockHash ? ccc.numFrom(input.cellOutput.capacity) : 0n), 0n);
    const outputCapacity = tx.outputs.reduce((total, output) => total + (hex(output.lock.hash()) === lockHash ? ccc.numFrom(output.capacity) : 0n), 0n);
    return inputCapacity > outputCapacity;
  };
  const actors = tx.inputs.flatMap(input => {
    if (!input.cellOutput || input.cellOutput.type || input.outputData !== "0x") return [];
    const lockHash = hex(input.cellOutput.lock.hash());
    // ACP/OmniLock deposit paths may consume a wallet's cell without its
    // signature when the matching outputs preserve/increase its balance.
    // Requiring a net debit rules out that unsigned top-up authorization.
    return lockHash !== proxy && authorized.has(lockHash) && spendsOwnCapacity(lockHash) ? [lockHash] : [];
  });
  if (!actors.length) throw new Error("The transaction must include a current assigned reviewer's, authorized Organizer owner's or administrator's own plain CKB input with a net capacity debit.");
  return {actorLockHashes: [...new Set(actors)]};
}
