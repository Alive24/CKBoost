/** Public discovery is an allowlist, including during provider refreshes. */
export function selectApprovedCampaigns<T extends { typeId?: string | null }>(
  campaigns: readonly T[],
  approvedTypeIds: readonly string[],
): T[] {
  const approved = new Set(approvedTypeIds.map(id => id.toLowerCase()));
  const seen = new Set<string>();
  return campaigns.filter(campaign => {
    const id = campaign.typeId?.toLowerCase();
    if (!id || !approved.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
