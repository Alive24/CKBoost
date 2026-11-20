import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useHeaderAccount } from "@/lib/revamp/use-header-account";
import { RevampSiteHeader } from "../site-shell";

const mockOpen=jest.fn();
jest.mock("next/navigation",()=>({usePathname:()=>"/revamp"}));
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{useCcc:()=>({open:mockOpen})}}));
jest.mock("@/lib/providers/pending-transaction-provider",()=>({usePendingTransactions:()=>({activeCount:2})}));
jest.mock("@/lib/providers/protocol-provider",()=>({useProtocol:()=>({protocolCell:null})}));
jest.mock("@/lib/revamp/discovery-provider",()=>({useDiscovery:()=>({protocolCell:null,protocolLoading:false,protocolError:null})}));
jest.mock("@/lib/revamp/use-header-account",()=>({useHeaderAccount:jest.fn()}));
jest.mock("../theme",()=>({useRevampTheme:()=>({theme:"dark",toggleTheme:jest.fn()})}));

it("shows the current address and exact spendable Points in the connected wallet trigger",()=>{
  jest.mocked(useHeaderAccount).mockReturnValue({isConnected:true,address:"ckt1-current-wallet",displayAddress:"ckt1...llet",points:9007199254740993123n,error:null,isLoading:false} as ReturnType<typeof useHeaderAccount>);
  render(<RevampSiteHeader/>);
  expect(screen.getByText("ckt1...llet")).toBeInTheDocument();
  expect(screen.getByText("9,007,199,254,740,993,123")).toBeInTheDocument();
  const wallet=screen.getByRole("button",{name:"Open wallet ckt1-current-wallet, 2 pending transactions"});
  fireEvent.click(wallet);
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

it("shows an unknown balance without fabricating zero Points",()=>{
  jest.mocked(useHeaderAccount).mockReturnValue({isConnected:true,address:null,displayAddress:null,points:null,error:"Balance unavailable",isLoading:false} as ReturnType<typeof useHeaderAccount>);
  render(<RevampSiteHeader/>);
  expect(screen.getByLabelText("Points balance unavailable")).toHaveTextContent("—");
  expect(screen.queryByText("0")).not.toBeInTheDocument();
});
