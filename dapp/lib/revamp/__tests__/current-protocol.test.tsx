import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolService } from "@/lib/services/protocol-service";
import { ProtocolProvider, useProtocol } from "@/lib/providers/protocol-provider";

jest.mock("@ckb-ccc/connector-react", () => ({ccc:{useCcc:jest.fn(),useSigner:jest.fn()}}));
jest.mock("@/lib/services/protocol-service", () => ({ProtocolService:jest.fn()}));
jest.mock("@/lib/services/achievement-service", () => ({AchievementService:jest.fn()}));
jest.mock("@/lib/ckb/deployment-manager", () => ({deploymentManager:{getCurrentNetwork:()=>"testnet",getContractCodeHash:()=>"0xcode"}}));
jest.mock("../../../../packages/ssri-ckboost/dist/index.js", () => ({createScopedLogger:()=>({error:jest.fn()})}));
jest.mock("@/lib/utils/endorser-resolver", () => ({createEndorserResolver:()=>({has:()=>false,resolve:()=>undefined,list:()=>[]})}));

const cell = {outputData:"v1"} as unknown as ccc.Cell;
const data = {endorsers_whitelist:[]} as any;
let service: {getProtocolCell:jest.Mock;getProtocolData:jest.Mock;getProtocolMetrics:jest.Mock;getProtocolTransactions:jest.Mock};
let latestRefresh: () => Promise<void>;
function Probe() {
  const context=useProtocol();
  latestRefresh=context.refreshProtocolData;
  return <><pre data-testid="state">{JSON.stringify({cell:context.protocolCell?.outputData,loading:context.isLoading,error:context.error})}</pre><button onClick={()=>void context.refreshProtocolData().catch(()=>{})}>Retry</button></>;
}
const state=()=>JSON.parse(screen.getByTestId("state").textContent!);
const tree=(mode?:"current"|"full")=><ProtocolProvider readMode={mode}><Probe/></ProtocolProvider>;
beforeEach(()=>{
  jest.mocked(ccc.useCcc).mockReturnValue({client:{}} as ReturnType<typeof ccc.useCcc>);
  jest.mocked(ccc.useSigner).mockReturnValue(undefined);
  service={getProtocolCell:jest.fn().mockResolvedValue(cell),getProtocolData:jest.fn().mockResolvedValue(data),getProtocolMetrics:jest.fn(),getProtocolTransactions:jest.fn()};
  jest.mocked(ProtocolService).mockImplementation(()=>service as unknown as ProtocolService);
});
afterEach(()=>jest.useRealTimers());

it("publishes the current cell without starting metrics or transaction history", async()=>{
  render(tree("current"));
  await waitFor(()=>expect(state()).toMatchObject({cell:"v1",loading:false,error:null}));
  expect(service.getProtocolMetrics).not.toHaveBeenCalled();
  expect(service.getProtocolTransactions).not.toHaveBeenCalled();
  const updated={outputData:"v2"};
  service.getProtocolCell.mockResolvedValue(updated);
  fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  await waitFor(()=>expect(state().cell).toBe("v2"));
  expect(service.getProtocolData).toHaveBeenLastCalledWith(updated);
});

it("keeps the original full loading path as the default", async()=>{
  let finish!: (value:unknown[])=>void;
  service.getProtocolTransactions.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  render(tree());
  expect(service.getProtocolMetrics).toHaveBeenCalledTimes(1);
  expect(service.getProtocolTransactions).toHaveBeenCalledTimes(1);
  expect(state().loading).toBe(true);
  await act(async()=>{finish([]);});
  await waitFor(()=>expect(state().cell).toBe("v1"));
});

it("expires an unresponsive current read and permits a successful retry", async()=>{
  jest.useFakeTimers();
  service.getProtocolCell.mockReturnValue(new Promise(()=>{}));
  render(tree("current"));
  await act(async()=>{jest.advanceTimersByTime(12000);});
  expect(state()).toMatchObject({loading:false,error:expect.stringContaining("timed out")});
  service.getProtocolCell.mockResolvedValue(cell);
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Retry"}));});
  expect(state()).toMatchObject({cell:"v1",loading:false,error:null});
});

it("contains deployment-constructor failures and can retry initialization", async()=>{
  jest.mocked(ProtocolService).mockImplementationOnce(()=>{throw new Error("Protocol contract not deployed");});
  render(tree("current"));
  await waitFor(()=>expect(state()).toMatchObject({loading:false,error:"Protocol contract not deployed"}));
  fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  await waitFor(()=>expect(state()).toMatchObject({cell:"v1",loading:false,error:null}));
});

it("ignores a previous client's late protocol result", async()=>{
  let finish!: (value:ccc.Cell)=>void;
  service.getProtocolCell.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const firstClient={};
  jest.mocked(ccc.useCcc).mockReturnValue({client:firstClient} as ReturnType<typeof ccc.useCcc>);
  const view=render(tree("current"));
  jest.mocked(ccc.useCcc).mockReturnValue({client:{}} as ReturnType<typeof ccc.useCcc>);
  service.getProtocolCell.mockResolvedValue({outputData:"new"});
  view.rerender(tree("current"));
  await waitFor(()=>expect(state().cell).toBe("new"));
  await act(async()=>{finish(cell);});
  expect(state().cell).toBe("new");
});

it("rejects a retained old refresh callback after changing clients", async()=>{
  const firstClient={};
  jest.mocked(ccc.useCcc).mockReturnValue({client:firstClient} as ReturnType<typeof ccc.useCcc>);
  const view=render(tree("current"));
  await waitFor(()=>expect(state().cell).toBe("v1"));
  const oldRefresh=latestRefresh;
  jest.mocked(ccc.useCcc).mockReturnValue({client:{}} as ReturnType<typeof ccc.useCcc>);
  service.getProtocolCell.mockResolvedValue({outputData:"new"});
  view.rerender(tree("current"));
  await waitFor(()=>expect(state().cell).toBe("new"));
  const reads=service.getProtocolCell.mock.calls.length;
  await expect(oldRefresh()).rejects.toThrow("wallet or network changed");
  expect(service.getProtocolCell).toHaveBeenCalledTimes(reads);
  expect(state().cell).toBe("new");
});
