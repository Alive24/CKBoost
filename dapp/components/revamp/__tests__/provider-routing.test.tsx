import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { Providers } from "@/components/providers";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

const mockWalletMount = jest.fn();

jest.mock("next/navigation", () => ({usePathname: jest.fn()}));
jest.mock("@/components/theme-provider", () => ({ThemeProvider: ({children}: {children: React.ReactNode}) => children}));
jest.mock("@/components/wallet-provider", () => ({WalletProvider: function WalletProvider({children}: {children: React.ReactNode}) {
  const {useEffect} = jest.requireActual("react");
  useEffect(() => {mockWalletMount();}, []);
  return <div data-testid="wallet">{children}</div>;
}}));
jest.mock("@/lib/providers/pending-transaction-provider", () => ({PendingTransactionProvider: ({children}: {children: React.ReactNode}) => <div data-testid="pending">{children}</div>}));
jest.mock("@/lib/revamp/discovery-provider", () => ({DiscoveryProvider: ({children}: {children: React.ReactNode}) => <div data-testid="discovery">{children}</div>}));
jest.mock("@/lib/providers/nostr-provider", () => ({NostrProvider: ({children}: {children: React.ReactNode}) => <div data-testid="nostr">{children}</div>}));
jest.mock("@/lib/providers/protocol-provider", () => ({ProtocolProvider: ({children,readMode}: {children: React.ReactNode;readMode?:string}) => <div data-testid={readMode==="current"?"current-protocol":"legacy-protocol"}>{children}</div>}));
jest.mock("@/lib/providers/campaign-provider", () => ({CampaignProvider: ({children}: {children: React.ReactNode}) => <div data-testid="legacy-campaign">{children}</div>}));
jest.mock("@/lib/providers/user-provider", () => ({UserProvider: ({children}: {children: React.ReactNode}) => <div data-testid="legacy-user">{children}</div>}));
jest.mock("@/lib/providers/campaign-admin-provider", () => ({CampaignAdminProvider: ({children}: {children: React.ReactNode}) => children}));
jest.mock("@/lib/providers/storage-modal-provider", () => ({StorageModalProvider: ({children}: {children: React.ReactNode}) => children}));
jest.mock("@/lib/providers/tipping-provider", () => ({TippingProvider: ({children}: {children: React.ReactNode}) => <div data-testid="legacy-tipping">{children}</div>}));
jest.mock("@/lib/providers/quest-claim-issuance-provider", () => ({QuestClaimIssuanceProvider: ({children}: {children: React.ReactNode}) => <div data-testid="legacy-claims">{children}</div>}));

describe("public preview data isolation", () => {
  it.each(["/", "/docs", "/campaign/0x123"])("keeps existing business contexts on %s", async path => {
    jest.mocked(usePathname).mockReturnValue(path);
    render(<Providers><main>Page</main></Providers>);
    await screen.findByRole("main");
    for (const name of ["wallet", "pending", "nostr", "legacy-protocol", "legacy-campaign", "legacy-user", "legacy-tipping", "legacy-claims"]) {
      expect(screen.getByTestId(name)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("discovery")).not.toBeInTheDocument();
  });

  it.each(["/revamp/campaign/0x123", "/revamp/campaigns/new", "/revamp/campaign/0x123/review"])("loads current protocol state without unrelated history on %s", async path => {
    jest.mocked(usePathname).mockReturnValue(path);
    render(<Providers><main>Page</main></Providers>);
    await screen.findByRole("main");
    for (const name of ["wallet", "pending", "nostr", "current-protocol"]) expect(screen.getByTestId(name)).toBeInTheDocument();
    for (const name of ["legacy-protocol", "legacy-campaign", "legacy-user", "legacy-tipping", "legacy-claims", "discovery"]) expect(screen.queryByTestId(name)).not.toBeInTheDocument();
  });

  it("does not start history, tipping or personal-data providers for public discovery", () => {
    jest.mocked(usePathname).mockReturnValue("/revamp");
    render(<Providers><main>Page</main></Providers>);
    for (const name of ["wallet", "pending", "nostr", "discovery"]) expect(screen.getByTestId(name)).toBeInTheDocument();
    for (const name of ["legacy-protocol", "legacy-campaign", "legacy-user", "legacy-tipping", "legacy-claims"]) expect(screen.queryByTestId(name)).not.toBeInTheDocument();
  });

  it.each(["/revamp/design-system", "/revamp/testnet-setup"])("does not fetch shared protocol data for isolated utility %s", path => {
    jest.mocked(usePathname).mockReturnValue(path);
    render(<Providers><main>Components</main></Providers>);
    expect(screen.getByRole("main")).toHaveTextContent("Components");
    expect(screen.queryByTestId("discovery")).not.toBeInTheDocument();
    expect(screen.queryByTestId("legacy-protocol")).not.toBeInTheDocument();
    expect(screen.queryByTestId("current-protocol")).not.toBeInTheDocument();
  });

  it("retains the wallet instance and query cache while switching between legacy and new routes", async () => {
    mockWalletMount.mockClear();
    const clients: QueryClient[] = [];
    function Probe() {
      clients.push(useQueryClient());
      return <main>Current route</main>;
    }
    jest.mocked(usePathname).mockReturnValue("/");
    const tree = <Providers><Probe /></Providers>;
    const view = render(tree);
    await screen.findByRole("main");
    const client = clients.at(-1)!;
    client.setQueryData(["retained-wallet-cache"], "previous result");
    for (const path of ["/revamp", "/revamp/campaign/0x123", "/profile"]) {
      jest.mocked(usePathname).mockReturnValue(path);
      view.rerender(<Providers><Probe /></Providers>);
      await screen.findByRole("main");
      expect(clients.at(-1)).toBe(client);
      expect(clients.at(-1)?.getQueryData(["retained-wallet-cache"])).toBe("previous result");
    }
    expect(mockWalletMount).toHaveBeenCalledTimes(1);
  });
});
