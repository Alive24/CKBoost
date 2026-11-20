import type { ccc } from "@ckb-ccc/connector-react";
import { createContributorSigner } from "../contributor-transaction";

describe("contributor wallet transaction boundary",()=>{
  it("keeps wallet signing/multisig behavior and observes only the real client broadcast",async()=>{
    const order:string[]=[];
    const original={
      client:{sendTransaction:jest.fn(async()=>{order.push("rpc");return "0xabc";})},
      privateWalletState:"wallet A",
      signTransaction:jest.fn(async function(this:{privateWalletState:string},tx:unknown){expect(this.privateWalletState).toBe("wallet A");order.push("sign");return tx;}),
      async sendTransaction(this:{signTransaction:(tx:unknown)=>Promise<unknown>;client:{sendTransaction:(tx:unknown)=>Promise<string>}},tx:unknown){const signed=await this.signTransaction(tx);return this.client.sendTransaction(signed);},
    };
    const guarded=createContributorSigner(original as unknown as ccc.Signer,async()=>{order.push("check");},()=>order.push("broadcast"));
    await guarded.sendTransaction({} as ccc.Transaction);
    expect(order).toEqual(["check","sign","check","broadcast","rpc"]);
    expect(original.client.sendTransaction).toHaveBeenCalledTimes(1);
    expect(original.client).not.toBe(guarded.client);
  });
  it("prevents broadcasting if the identity/role/deadline changes during the wallet signature",async()=>{
    let valid=true;
    const broadcast=jest.fn(),rpc=jest.fn();
    const original={client:{sendTransaction:rpc},async signTransaction(){valid=false;return {};},async sendTransaction(this:{signTransaction:()=>Promise<unknown>;client:{sendTransaction:(tx:unknown)=>unknown}}){return this.client.sendTransaction(await this.signTransaction());}};
    const guarded=createContributorSigner(original as unknown as ccc.Signer,async()=>{if(!valid)throw new Error("Permission changed");},broadcast);
    await expect(guarded.sendTransaction({} as ccc.Transaction)).rejects.toThrow("Permission changed");
    expect(broadcast).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves an original wallet rejection and does not report a broadcast",async()=>{
    const rpc=jest.fn(),onBroadcast=jest.fn();
    const original={client:{sendTransaction:rpc},sendTransaction:jest.fn(async()=>{throw new Error("Wallet cancelled");})};
    const guarded=createContributorSigner(original as unknown as ccc.Signer,async()=>{},onBroadcast);
    await expect(guarded.sendTransaction({} as ccc.Transaction)).rejects.toThrow("Wallet cancelled");
    expect(onBroadcast).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  });
});
