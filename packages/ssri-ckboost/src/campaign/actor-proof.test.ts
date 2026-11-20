import {ccc} from '@ckb-ccc/core';
import {assertActorNetCapacitySpend,guardPrivilegedActorSigner,retainOutputCapacityFloor} from './actor-proof';
const hex=(value:string)=>`0x${value.repeat(64)}` as ccc.Hex;
const lock=ccc.Script.from({codeHash:hex('1'),hashType:'type',args:'0x'}),hash=lock.hash();
const token=ccc.Script.from({codeHash:hex('2'),hashType:'type',args:'0x'});
const CKB=100000000n;
const cell=(id:string,capacity:bigint,type?:ccc.Script,data='0x')=>ccc.Cell.from({outPoint:{txHash:hex(id),index:0},cellOutput:{capacity:capacity*CKB,lock,type},outputData:data});
function fixture(outputs:ccc.CellOutputLike[],inputs=[cell('3',1000n)]){
 const tx=ccc.Transaction.from({inputs:inputs.map(value=>({previousOutput:value.outPoint})),outputs,outputsData:outputs.map(()=>'0x')});
 const client={getCell:jest.fn(async(out:ccc.OutPointLike)=>inputs.find(value=>value.outPoint.txHash===out.txHash)),sendTransaction:jest.fn(async()=>hex('9'))};
 const signer={client,getRecommendedAddressObj:jest.fn(async()=>({script:lock})),sendTransaction:jest.fn(async function(this:ccc.Signer,value:ccc.TransactionLike){return this.client.sendTransaction(value);})} as unknown as ccc.Signer;
 return{tx,signer,client};
}
describe('privileged actor CKB spend proof',()=>{
 it.each([1000n,1001n])('rejects a fully refunded or ACP-deposit-only input (%s CKB output)',async amount=>{
  const{tx,signer}=fixture([{capacity:amount*CKB,lock}]);await expect(assertActorNetCapacitySpend(signer,tx,hash)).rejects.toThrow('net CKB spend');
 });
 it('accepts a strictly spending actor and counts all typed cells in the lock group',async()=>{
  const first=fixture([{capacity:999n*CKB,lock}]);await expect(assertActorNetCapacitySpend(first.signer,first.tx,hash)).resolves.toBeUndefined();
  const typedCredit=fixture([{capacity:900n*CKB,lock},{capacity:200n*CKB,lock,type:token}]);await expect(assertActorNetCapacitySpend(typedCredit.signer,typedCredit.tx,hash)).rejects.toThrow('net CKB spend');
  const typedDebit=fixture([{capacity:1400n*CKB,lock}],[cell('3',1000n),cell('4',500n,token)]);await expect(assertActorNetCapacitySpend(typedDebit.signer,typedDebit.tx,hash)).resolves.toBeUndefined();
 });
 it('requires a real plain-empty input and the same current wallet',async()=>{
  const typedOnly=fixture([{capacity:999n*CKB,lock}],[cell('3',1000n,token)]);await expect(assertActorNetCapacitySpend(typedOnly.signer,typedOnly.tx,hash)).rejects.toThrow('plain wallet input');
  const nonempty=fixture([{capacity:999n*CKB,lock}],[cell('3',1000n,undefined,'0x01')]);await expect(assertActorNetCapacitySpend(nonempty.signer,nonempty.tx,hash)).rejects.toThrow('plain wallet input');
  const switched=fixture([{capacity:999n*CKB,lock}]);await expect(assertActorNetCapacitySpend(switched.signer,switched.tx,hex('0'))).rejects.toThrow('account changed');
 });
 it('keeps a co-signed raw transaction unchanged through wallet and client send boundaries',async()=>{
  const good=fixture([{capacity:999n*CKB,lock}]);await expect(guardPrivilegedActorSigner(good.signer,hash,good.tx.hash()).sendTransaction(good.tx)).resolves.toBe(hex('9'));
  const changed=fixture([{capacity:999n*CKB,lock}]);const original=changed.tx.hash();
  jest.mocked(changed.signer.sendTransaction).mockImplementation(async function(this:ccc.Signer,value){const draft=ccc.Transaction.from(value);draft.outputs[0].capacity-=1n;return this.client.sendTransaction(draft);});
  await expect(guardPrivilegedActorSigner(changed.signer,hash,original).sendTransaction(changed.tx)).rejects.toThrow('raw fields changed');expect(changed.client.sendTransaction).not.toHaveBeenCalled();
 });
 it('retains an existing state-cell floor while still growing for larger serialized data',()=>{
  const {tx}=fixture([{capacity:10n*CKB,lock,type:token}]);retainOutputCapacityFloor(tx,0,1000n*CKB);expect(tx.outputs[0].capacity).toBe(1000n*CKB);
  tx.outputsData[0]=`0x${'ff'.repeat(2000)}`;retainOutputCapacityFloor(tx,0,1000n*CKB);expect(tx.outputs[0].capacity).toBeGreaterThan(1000n*CKB);
 });
});
