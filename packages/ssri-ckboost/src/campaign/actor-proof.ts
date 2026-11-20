import {ccc} from "@ckb-ccc/core";

/** Keep released settings capacity inside the existing state cell. Otherwise
 * deleting content could refund the actor more CKB than its fee and make a
 * signed update look like an unsigned ACP deposit to the consensus proof. */
export function retainOutputCapacityFloor(tx:ccc.Transaction,index:number,capacity:ccc.NumLike):void {
  const output=tx.outputs[index];if(!output)throw new Error("State output not found while preserving its capacity.");
  const minimum=ccc.CellOutput.from({lock:output.lock,type:output.type},tx.outputsData[index]);
  const floor=ccc.numFrom(capacity);if(minimum.capacity<floor)minimum.capacity=floor;
  tx.outputs[index]=minimum;
}

/** A plain ACP input alone may be consumed without its owner's signature.
 * Net CKB spend disables the deposit-only unlock branch. Inspect every cell
 * with the actor's complete lock hash, including typed inputs/outputs. */
export async function assertActorNetCapacitySpend(signer:ccc.Signer, transaction:ccc.TransactionLike, expectedLockHash:ccc.HexLike):Promise<void> {
  const actor=ccc.hexFrom(expectedLockHash).toLowerCase();
  const current=(await signer.getRecommendedAddressObj()).script.hash().toLowerCase();
  if(current!==actor)throw new Error("Wallet account changed before signing this privileged action.");
  const tx=ccc.Transaction.from(transaction);
  let input=0n,output=0n,plain=false;
  for(const reference of tx.inputs){
    const cell=await signer.client.getCell(reference.previousOutput);
    if(!cell)throw new Error("An authorization input could not be resolved. Rebuild the transaction.");
    if(cell.cellOutput.lock.hash().toLowerCase()!==actor)continue;
    input+=ccc.numFrom(cell.cellOutput.capacity);
    if(!cell.cellOutput.type&&ccc.hexFrom(cell.outputData)==="0x")plain=true;
  }
  for(const cell of tx.outputs)if(cell.lock.hash().toLowerCase()===actor)output+=ccc.numFrom(cell.capacity);
  if(!plain||input<=output)throw new Error("This privileged action requires a plain wallet input and a net CKB spend. A deposit or fully refunded input cannot authorize it.");
}

/** Protect both the wallet boundary and the client's final broadcast, without
 * replacing a wallet's own preparation/signing implementation. */
export function guardPrivilegedActorSigner(signer:ccc.Signer, expectedLockHash:ccc.HexLike, expectedRawHash?:ccc.HexLike):ccc.Signer {
  const check=async(transaction:ccc.TransactionLike)=>{
    if(expectedRawHash && ccc.Transaction.from(transaction).hash()!==ccc.hexFrom(expectedRawHash))throw new Error("A co-signed transaction's raw fields changed. Rebuild it before signing.");
    await assertActorNetCapacitySpend(signer,transaction,expectedLockHash);
  };
  const client=new Proxy(signer.client,{get(target,key){
    const value=Reflect.get(target,key,target);
    if(key==="sendTransaction")return async(...args:Parameters<ccc.Client["sendTransaction"]>)=>{await check(args[0]);return target.sendTransaction(...args);};
    return typeof value==="function"?value.bind(target):value;
  }});
  return new Proxy(signer,{get(target,key,receiver){
    if(key==="client")return client;
    if(key==="sendTransaction")return async(...args:Parameters<ccc.Signer["sendTransaction"]>)=>{await check(args[0]);return target.sendTransaction.apply(receiver,args);};
    const value=Reflect.get(target,key,target);
    return typeof value==="function"?value.bind(target):value;
  }});
}
