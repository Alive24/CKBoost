# Independent Testnet protocol: unsigned preparation

This module is a preparation boundary for the future isolated QA process. It is not a deployed protocol, an active deployment registry or an end-to-end wallet acceptance result. It never changes `deployments.json`/environment/provider state and contains no signature or broadcast API. The current shared protocol remains outside this module.

The implemented API is deliberately limited to public profile validation, initial ProtocolData construction, read-only unsigned preparation and rechecking a prepared transaction. Explicit signing, unknown-broadcast receipt persistence, committed/live confirmation, protocol manifest export and applying that manifest to the isolated frontend/functions are still required before business testing. The existing code-cell workbench implements those stages for code cells only; do not treat its code manifest as a protocol-state manifest.

## Explicit input profile

`validateIsolatedTestnetProfile(input)` returns the normalized public profile. The input has:

```ts
{
  schema: "ckboost-isolated-testnet-profile/v1",
  network: "testnet",
  executorUrl: "http://127.0.0.1:9091/",
  dependencies: inventory.dependencies, // all seven reviewed reusable records
  newCode: {
    protocolLock: confirmedProtocolLockManifest,
    campaignType: confirmedCampaignTypeManifest,
  },
}
```

The seven approved identities are pinned in `TESTNET_PROTOCOL_DEPENDENCY_PINS` from the public, independently live-checked inventory recorded on2026-11-19. Each record's name, type code hash, byte data hash, size and outpoint must match that inventory exactly. Duplicate/missing entries and mainnet profiles fail before requests. This is a source-level trust anchor, not a network selector or global registry mutation.

The two new records must use the existing `ckboost-testnet-code-deployment/v1` confirmed manifest format, Testnet, the correct contract name, the pinned reviewed release byte size/hash, a real TypeID script and consistent `typeHash`. Placeholder/null deployment records and invented release data hashes fail. The new code output is required at0 because that is the invariant of the reviewed code-cell workbench. The live check additionally fetches its committed transaction, verifies its actual block number/body hash/output, and recomputes the TypeID from that transaction's first input and output index. Merely relabeling an upgraded legacy TypeID code cell does not qualify as a fresh code deployment.

Only the local compatibility executor9091 is accepted; arbitrary remote/local URLs, credentials, query strings and alternate paths are rejected. Its allowlisted SSRI execution is a read/proposal service, not a signer. The underlying reusable protocol-type source and the live executor's new-creation branch still need actual integration acceptance against the user's real selected wallet/input.

## Public functions

- `validateIsolatedTestnetProfile(input)`: pure structural/identity validation. It does not trust an earlier `identityCheckedAt` timestamp as proof of current liveness.
- `buildIsolatedTestnetProtocolData(normalized, walletLockHash, now?)`: one current-wallet admin; new policy code hashes; empty campaigns/tippings approved, Organizer whitelist, optional accepted asset scripts and achievements; default existing tipping policy; no inherited old protocol membership. Timestamp follows the existing protocol's milliseconds convention.
- `prepareTestnetProtocolDeployment(signer, input, isCurrent?)`: public Testnet client only. It freshly reads all nine code cells, validates new code receipts, uses an exact recommended-lock collector (skipping typed/nonempty/related-lock candidates) and seeds only ordinary live empty untyped inputs owned by this wallet, and calls the existing `Protocol.updateProtocol` with empty args and no existing outputs. It returns `PreparedTestnetProtocolDeployment` with transaction/body hash, actual protocol output index/type identity, exact data/hash, real final-lock occupied capacity, calculated fee, wallet identity, expected first input and original output-type recipe.
- `assertPreparedTestnetProtocol(prepared, tx?)`: pure guard for a later explicit signing boundary. It detects changed profile, first input, TypeID/index, owner/protocol links, data/admin/config, code deps, capacity, output receivers, recipe and raw transaction body. It **does not** replace a fresh wallet/network/live-input/code check immediately before a future signature and broadcast.

No production caller or UI is wired to this new module in this change. Calling preparation is explicitly read-only; signing methods exposed through the signer/client passed to the SDK are fenced. Tests never contact a wallet or chain.

## Transaction invariants

1. Exact public Testnet client and current scope are rechecked around asynchronous stages. Individual code/receipt/input reads have12-second deadlines; total preparation has a120-second deadline and expired work cannot be returned. An already in-flight RPC can finish, but checks prevent accepting its old result.
2. All nine code cells must be live with exact typed identity and byte hash/size. The two new code transactions must be committed and fresh TypeID creations. No global manager fallback is used.
3. Fresh seed has no outputs and a first ordinary wallet input. SSRI may not change those seed inputs or append unrelated outputs. The protocol is the only initial output, currently enforced at0, and its32-byte TypeID must equal `hashTypeId(input0, actualIndex)`.
4. Final protocol lock uses the **new manifest's** `hashType=type`, never the funding wallet's hash type. `ConnectedTypeID.type_id` is current wallet lock hash; `connected_key` is the new protocol output type hash. Capacity is recalculated from this final lock, type script and exact ProtocolData bytes; no historical500-CKB UI prompt is used as a promise.
5. Recipe is canonical Molecule in `WitnessArgs.outputType`: full UTF8 `CKBoostProtocol.update_protocol`, exactly one Output argument (`arg_type=2`), exactly four little-endian bytes referring to the actual output-data index; no optional recipe deps and no second output-type recipe. Fee completion must preserve it byte for byte. Wallet placeholders/signatures belong in `WitnessArgs.lock`.
6. After funding/fee preparation, every input is freshly checked live/plain-empty and under the same wallet lock, with no duplicate outpoint. Only the new protocol and empty same-wallet change may appear in outputs. Final first input, TypeID, data, ownership, minimum capacity, required code deps, recipe and raw body are revalidated. The fee is computed from freshly verified actual input capacities, not merely cached input metadata.

The module supplies only an unsigned proposal. `assertPreparedTestnetProtocol` permits a future wallet to fill lock witnesses while holding all raw fields and protocol recipe constant. A future implementation must persist its known body hash before broadcast, stop on uncertainty, and verify committed/live protocol data before producing an active QA configuration. Do not invoke the legacy all-in-one `deployProtocolCell` helper from this preparation path.

## Tests and evidence boundary

The focused tests use real CCC/Molecule codecs with an explicitly synthetic reviewed inventory and mocked read-only client/SSRI/fee boundaries. They cover missing/changed/duplicate identities, wrong network/URL, unpinned code, live code mismatch/absence, new code transaction evidence, final `data1` wallet→`type` protocol lock binding, exact capacity/fee, initial admin/empty memberships, wrong/missing/injected recipe variants, stale scope, forbidden typed inputs and raw tampering. Fixture pin overrides are Jest-only and restored after each test; no fake manifest is installed into the app or deployment registry.

These tests do not certify live SSRI new creation, signing, actual code/protocol deployment or business end-to-end behavior. Existing separately recorded SSRI update/version smoke tests and VM7/ACP4 release tests remain separate evidence sets.

CCC collector source check: default capacity filters are empty/untyped, but base Signer.findCells traverses all related addresses. This module overrides its capacity iterator with the recommended full lock, an exact search and explicit per-candidate filtering. Current MetaMask/EIP6963 SignerEvm.prepareTransaction only derives addresses/adds code deps and SighashAll placeholders; actual signing is in the separate signOnlyTransaction/personal_sign path. No attempt is made to defend against a malicious replacement wallet implementation.

Focused validation from the repository root:

```sh
pnpm --dir dapp test -- --runInBand --testPathPattern='testnet-(protocol|code)-deployment'
```

The current result is2 suites/36 tests PASS (25 new protocol preparation cases plus11 existing code deployment cases). A separate `tsc --noEmit --incremental false` check has no new module/test diagnostics; the repository's10 unrelated baseline errors remain. No production build/server was restarted by this change.
