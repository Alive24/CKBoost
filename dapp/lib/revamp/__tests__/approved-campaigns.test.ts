import { selectApprovedCampaigns } from "../approved-campaigns";

const a = `0x${"a1".repeat(32)}`;
const b = `0x${"b2".repeat(32)}`;
const c = `0x${"c3".repeat(32)}`;

describe("public campaign approval allowlist", () => {
  it("fails closed when the current allowlist is empty, including cached campaigns", () => {
    expect(selectApprovedCampaigns([{typeId: a}, {typeId: b}], [])).toEqual([]);
  });

  it("only exposes explicitly approved full type IDs, independent of other metadata", () => {
    const approved = {typeId: a, title: "Approved"};
    const unlisted = {typeId: b, title: "Pending review", approved: true};
    expect(selectApprovedCampaigns([unlisted, approved], [a])).toEqual([approved]);
  });

  it("normalizes hexadecimal casing and deduplicates repeated approved cells", () => {
    const input = [{typeId: a}, {typeId: a.toUpperCase()}, {typeId: b}];
    const result = selectApprovedCampaigns(input, [a.toUpperCase(), a, b]);
    expect(result).toHaveLength(2);
    expect(result.map(item => item.typeId.toLowerCase())).toEqual([a, b]);
  });

  it("never substitutes a matching type hash or shortened display ID for a missing type ID", () => {
    const input = [
      {typeId: null, typeHash: a, id: a},
      {typeId: undefined, typeHash: a, id: a},
      {typeId: "", typeHash: a, id: a},
      {typeId: a.slice(0, 8), typeHash: a, id: a},
    ];
    expect(selectApprovedCampaigns(input, [a])).toEqual([]);
  });

  it("does not confuse IDs that share the shortened display prefix", () => {
    const first = `0x${"ab".repeat(31)}01`;
    const second = `0x${"ab".repeat(31)}02`;
    const input = [{typeId: first, id: first.slice(0, 8)}, {typeId: second, id: second.slice(0, 8)}];
    expect(selectApprovedCampaigns(input, [second])).toEqual([input[1]]);
  });

  it("immediately removes revoked IDs when cached provider cells outlive an approval refresh", () => {
    const cached = [{typeId: a}, {typeId: b}, {typeId: c}];
    expect(selectApprovedCampaigns(cached, [a, b]).map(item => item.typeId)).toEqual([a, b]);
    expect(selectApprovedCampaigns(cached, [b]).map(item => item.typeId)).toEqual([b]);
    expect(selectApprovedCampaigns(cached, [])).toEqual([]);
  });

  it("preserves caller data and object references while returning a separate filtered list", () => {
    const first = Object.freeze({typeId: a, title: "First"});
    const second = Object.freeze({typeId: b, title: "Second"});
    const input = Object.freeze([second, first]);
    const allowlist = Object.freeze([a, b]);
    const result = selectApprovedCampaigns(input, allowlist);
    expect(result).not.toBe(input);
    expect(result[0]).toBe(second);
    expect(result[1]).toBe(first);
    expect(input).toEqual([second, first]);
    expect(allowlist).toEqual([a, b]);
  });
});
