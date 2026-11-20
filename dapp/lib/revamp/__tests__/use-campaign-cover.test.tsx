import {act, cleanup, render, screen} from "@testing-library/react";
import {acquireCampaignCover} from "../campaign-cover-cache";
import {useRevampCampaignCover} from "../use-campaign-cover";

const mockNostr = {};
jest.mock("@/lib/providers/nostr-provider", () => ({useNostr: () => ({nostr: mockNostr}), DEFAULT_NOSTR_RELAYS: []}));
jest.mock("../campaign-cover-cache", () => ({
  coverReference: (source?: string | null) => source ? {key: source, source, ...(source.startsWith("nevent") ? {eventId: source} : {})} : null,
  acquireCampaignCover: jest.fn(),
}));
let notify: IntersectionObserverCallback;
const originalObserver = global.IntersectionObserver;
beforeEach(() => {
  jest.clearAllMocks();
  global.IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
    notify = callback; return {observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn()};
  }) as unknown as typeof IntersectionObserver;
});
afterEach(cleanup);
afterAll(() => { global.IntersectionObserver = originalObserver; });
function Cover({source}: {source: string}) {
  const cover = useRevampCampaignCover(source);
  return <div ref={cover.ref} data-testid="cover">{cover.src ?? "No image source"}</div>;
}
function visible(value: boolean) {
  act(() => notify([{target: screen.getByTestId("cover"), isIntersecting: value} as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
}

it("does not resolve nevent or render its image source until near the viewport", async () => {
  const release = jest.fn();
  jest.mocked(acquireCampaignCover).mockReturnValue({promise: Promise.resolve({src: "blob:cover", bytes: 1, objectUrl: true}), release});
  render(<Cover source="nevent1cover"/>);
  expect(acquireCampaignCover).not.toHaveBeenCalled(); expect(screen.getByTestId("cover")).toHaveTextContent("No image source");
  await act(async () => visible(true));
  expect(acquireCampaignCover).toHaveBeenCalledTimes(1); expect(screen.getByTestId("cover")).toHaveTextContent("blob:cover");
  visible(false); expect(release).toHaveBeenCalledTimes(1); expect(screen.getByTestId("cover")).toHaveTextContent("No image source");
});

it("ignores old-source results and releases shared work on a source change or unmount", async () => {
  let finishOld!: (value: {src: string; bytes: number; objectUrl: boolean}) => void;
  const releaseOld = jest.fn(), releaseNew = jest.fn();
  jest.mocked(acquireCampaignCover).mockReturnValueOnce({promise: new Promise(resolve => {finishOld = resolve;}), release: releaseOld})
    .mockReturnValueOnce({promise: Promise.resolve({src: "blob:new", bytes: 1, objectUrl: true}), release: releaseNew});
  const view = render(<Cover source="nevent1old"/>); visible(true);
  await act(async () => view.rerender(<Cover source="nevent1new"/>));
  expect(releaseOld).toHaveBeenCalledTimes(1); expect(screen.getByTestId("cover")).toHaveTextContent("blob:new");
  await act(async () => finishOld({src: "blob:old", bytes: 1, objectUrl: true}));
  expect(screen.getByTestId("cover")).toHaveTextContent("blob:new");
  view.unmount(); expect(releaseNew).toHaveBeenCalledTimes(1);
});

it("also withholds direct remote image URLs while offscreen without blocking them behind Nostr work", () => {
  render(<Cover source="https://example.com/direct.png"/>);
  expect(screen.getByTestId("cover")).toHaveTextContent("No image source"); visible(true);
  expect(screen.getByTestId("cover")).toHaveTextContent("https://example.com/direct.png");
  expect(acquireCampaignCover).not.toHaveBeenCalled();
});
