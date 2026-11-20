# Testnet code deployment workspace

`/revamp/testnet-setup` is a purpose-built wallet deployment tool. It is not linked from product navigation. The server returns 404 unless `CKBOOST_ENABLE_TESTNET_SETUP=1`; an explicit `NEXT_PUBLIC_CKB_NETWORK=mainnet` also returns 404. The page is dynamically rendered, so the private enable flag is checked on the server for each request. The connected CCC client must additionally use public CKB Testnet (`ckt`, HTTPS/WSS testnet.ckb.dev or testnet.ckbapp.dev). No private key is requested, imported, or stored.

The root wallet provider is reused. This route should bypass both legacy and revamp business providers: code deployment does not require the shared protocol, Nostr, user cells, or the admin proxy.

## Reviewed artifacts

The release candidates are pinned in `testnet-code-deployment.ts`. They came from the local `work/testnet-release/manifest.json` build, target `riscv64imac-unknown-none-elf`, release profile. The source working tree includes local authorization fixes, so the base Git commit alone does not identify the full artifact; retain the complete release manifest/source fingerprints with the binaries.

| Contract | File bytes | CKB data hash |
| --- | ---: | --- |
| Protocol lock | 183336 | `0xc05104a58335932de04ddc8aaaf95f252394b1012580f3a118527400ced856c7` |
| Campaign type | 255480 | `0x8f47dc10346658617399a196e994aba09d1e7ed06bdb01111ac783510b17a62b` |

File names are informational. Exact size, ELF64 little-endian/RISC-V executable headers, and CKB data hash must match. A renamed wrong binary or a debug build fails validation. Rebuilding a different artifact intentionally requires review and a source update to these pins.

## Manual workflow

1. Start the local app with the private server enable flag explicitly set. Do not change the shared deployment JSON or protocol args to reach this tool.
2. Open `/revamp/testnet-setup`, connect the intended Testnet wallet through the existing CCC connector, and check the full receiving address/lock hash.
3. Select one pinned release file. File selection only validates local bytes.
4. Click **Prepare … transaction**. This reads wallet capacity cells, constructs a brand-new Type ID output, and calculates the exact current fee. It never requests a signature or broadcasts.
5. Review the occupied capacity, network fee, receiving wallet, Type ID args, type hash, and binary data hash. Only **Deploy new code cell** signs and broadcasts through the connected wallet. A rejected signature is shown directly and is not retried automatically.
6. Wait for a committed transaction. The tool re-reads live output 0 and verifies owner lock, capacity, exact Type ID script, and binary data hash before allowing manifest export. Exported manifests describe code cells only.
7. Deploy the second candidate separately if required. No batching, upgrades, role changes, protocol updates, or local configuration writes occur.

For a standard secp lock with 20-byte args, occupied size is `binaryBytes + 8 + 53 + 65`: capacity field, actual lock, and Type ID type script. Therefore the cells need **183462 + 255606 = 439068 tCKB**, before transaction fees. Other wallets can have longer locks; the tool calculates from the actual script. Capacity remains in code cells under the connected wallet's lock. Spending those code cells later invalidates their live dependencies. It is distinct from the network fee.

Type ID is the built-in type script `0x00000000000000000000000000000000000000000000000000545950455f4944`, `hashType: type`, with `ccc.hashTypeId(firstInput, outputIndex)` args. The **new code cell's type script hash** is the contract `codeHash` used with `hashType: type`; the CKB **data hash** separately identifies the uploaded binary. Do not substitute the built-in Type ID constant or binary data hash for that type script hash.

## Transaction and lifecycle boundaries

- Every funding input is re-read as live and must be empty, untyped, and controlled by the same complete wallet lock. Existing typed code/protocol cells cannot be consumed.
- Output 0 contains the new code. Other outputs must be empty, untyped change to the same lock. Type ID input/output positions and the raw transaction body are checked before signing, and the body is checked again after signing.
- Switching wallet/client/file invalidates the prepared operation. Read preparation has a 30-second deadline; wallet-address reads and input reads are bounded. Expired preparation cannot request a signature later.
- A wallet prompt is never timed out into an automatic retry. The user can reject it in the wallet. The app performs no automatic signing.
- A successful or ambiguous broadcast saves only a public transaction receipt in this browser. A network error after broadcast is **unknown status**, never claimed as a failed or confirmed deployment. Check that hash before preparing another deployment.
- Confirmation waiting is bounded. **Check confirmation** performs reads only; refreshing and rechecking saved receipts never requests another signature. A mismatching or no-longer-live code cell blocks export.
- Exported `preparedFeeShannons` is the fee estimated when preparing the transaction, explicitly labeled as such: restoring a public receipt does not independently reconstruct the fee from all confirmed inputs. The exported receiving/deployer address is derived from the verified on-chain wallet lock rather than trusting the stored display address.
- No real wallet send, deployment, or browser-wallet acceptance test was performed while implementing this tool. Unit tests mock only wallet/RPC side effects and exercise real CCC hash/Molecule objects.

## Isolated protocol remains a separate step

This tool does **not** yet create an isolated protocol or automatically activate the new permissions. The two exported manifests cannot be imported blindly as the complete root `deployments.json`.

An isolated setup must select a complete deployment profile for protocol type, protocol lock, campaign type, funding lock, user type, Points UDT, tipping/achievement support, and the claimable-pool lock as used by the test. The new protocol lock/campaign type entries must reference the newly confirmed code cells; other dependencies must have their own verified live code cells and compatible versions. Do not upgrade the existing shared Type ID code cells or copy shared approved campaign/user data.

The existing `deployProtocolCell` path already uses a connected CCC signer plus an SSRI executor to create protocol state. Its current dependencies come from the global deployment manager, and it mutates the output lock after the SDK computes capacity. A dedicated isolated-protocol step should accept an explicit profile, recompute output occupied capacity after setting the final ConnectedTypeID lock, retain recipe witnesses, validate the actual protocol output index, and wait for committed confirmation. The current helper returns the first typed output and hardcodes returned outpoint index 0; do not assume those shortcuts remain correct for a composed transaction.

Only then configure the isolated app/build with that complete profile and the **new** `NEXT_PUBLIC_PROTOCOL_TYPE_ARGS`; current Home discovery inlines `.current` deployment records at Next build time. Verify on-chain binary data hashes and live outpoints before adding the new protocol lock type hash to `NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES`. That allowlist is a deployment capability declaration, not an Organizer role grant. Grant Organizer via the new protocol's actual admin-controlled whitelist.

SSRI must be running and able to load the selected code outpoints. Next alone does not host SSRI or Netlify functions. Non-admin Staff approvals still need a separately configured compatible proxy signing service for the isolated protocol; this browser tool cannot replace that co-signer and never asks the user to export a wallet key. An admin-wallet direct review can test the direct path separately.

## Verification

Focused suites: `pnpm exec jest --runInBand lib/revamp/__tests__/testnet-code-deployment.test.ts components/revamp/__tests__/testnet-setup-workspace.test.tsx`.

Official CCC references: [transaction composition](https://docs.ckbccc.com/en/docs/guides/compose-transactions) and [browser Playground](https://docs.ckbccc.com/en/docs/guides/playground). These establish connected-wallet transaction building/signing; this tool uses the project's installed connector API rather than assuming a newer connector migration.
