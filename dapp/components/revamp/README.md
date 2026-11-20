# CKBoost Home + Campaign redesign

Figma source: [CKBoost Redesign](https://www.figma.com/design/nxsPSskHMjrxLYW8AWTf5N/CKBoost-Redesign?node-id=17-2). The six sections cover discovery, contributor submission, pending-response editing, campaign creation, saved templates, and submission review. State variants share routes and components.

## Routes and isolation

- `/revamp`: approved campaign discovery, search and status/difficulty filters.
- `/revamp/campaign/[campaignTypeId]`: public Overview; `?tab=quests` selects contributor quests.
- `/revamp/campaign/[campaignTypeId]/edit`: campaign and reviewer configuration.
- `/revamp/campaigns/new`: creation, wallet-scoped drafts and templates.
- `/revamp/campaign/[campaignTypeId]/review`: assigned reviewer workspace and quest exports.
- `/revamp/design-system`: scoped Light/Dark controls and typography.

The `(legacy)` route group owns the original Nextra layout and page map; its URLs remain unchanged. The `/revamp` layout does not import that shell or construct its page map. The root keeps one shared wallet/query instance while route-specific business providers load on demand. The new subtree is hidden from legacy navigation and marked noindex. The existing homepage is not replaced.

Next's build config derives a small public current-deployment constant from the authoritative `deployments.json`. Discovery reads that constant instead of importing the full deployment history. The original manager, history and shared server protocol helpers keep their APIs and data; loading the manager binds the same current object so its existing in-memory updates remain visible. This requires no new manual environment configuration and does not change deployment records.

Isolated QA runtimes are an explicit opt-in with a validated public profile, distinct protocol identity, scoped drafts and separate build output. The default configuration continues to use `deployments.json`. Public Testnet and shared Nostr relays remain shared services, not a private sandbox. Local setup/upgrade operators are disabled unless `CKBOOST_ENABLE_TESTNET_SETUP=1`. Their loopback-only artifact endpoints load separately verified public manifests at `../../../outputs` and exact pinned ELFs at `../../testnet-release`, including `permissions-v2` for upgrades; both paths are relative to the `dapp` working directory. These external artifacts are not included in a normal checkout or required by the default app; artifact loading fails closed if they are missing or mismatched. Moving a checkout requires providing and verifying those artifacts again. Loading a profile or artifact does not deploy code or activate a runtime.

Colors use wrapper-scoped `--ckb-` variables and CSS Modules. `ckboost-revamp-theme` never changes the document theme class or the old theme preference. Radix portals use the wrapper container. Exact Figma exports live in `public/assets/revamp`; fonts are local, with the new fonts’ OFL notices. Existing Cabinet Grotesk and UI primitives are reused.

## Role policy

The protocol’s on-chain `endorsers_whitelist` is the administrator-managed Organizer registry. Admin retains its management override and platform-approval authority. A currently granted Organizer may create campaigns, and may edit or assign reviewers only on its verified own campaigns. Metadata alone cannot establish ownership: `verifyCampaignOwnership` verifies the configured campaign type and protocol lock, full campaign ID, protocol connection, and owner lock hash.

Review requires a current platform Admin, the campaign's verified owner with a current Organizer grant, or a Reviewer listed in that campaign's consumed `staff_lock_hash_vec`. Assigned Reviewers receive authority only for their assigned campaigns, without settings, Organizer or platform-approval rights. Contributor writes also require the current identity, platform approval, open schedule, eligibility, valid responses and a still-pending own record. Wallet, protocol, activity and response facts are refreshed at transaction boundaries; unsaved provider draft data is not an authorization source.

The SDK, services, proxy endpoint and contracts enforce input-state grants and a net CKB debit by the authorized lock group for privileged actions. This prevents an unsigned ACP deposit from impersonating its owner. State-cell capacity floors preserve ordinary settings edits, and a proxy-co-signed transaction's raw fields remain unchanged. Native, complete CKB-VM and official ACP-lock regressions are documented in `contracts/auth-tests/README.md`.

Contract authorization changes require a separate deployment/upgrade before an old network gains the new behavior. A local source change or passing frontend test is not proof of live-chain support. Deployment capability checks and their configuration are documented in the creation implementation notes.

## Data and transaction behavior

Home uses a separate HTTPS-first read client, so its public reads do not wait for the wallet client's default WebSocket fallback. One protocol snapshot precedes a bounded, paginated campaign batch. Every result must match the configured campaign type, canonical full ConnectedTypeID, current protocol and approved ID; uncovered IDs use exact lookups with bounded concurrency. A batch page budget never silently drops approved IDs. The wallet signing/sending client is unchanged.

Queries coalesce in-flight requests and retain still-approved cached cards during refresh. Individual campaign cache keys use the actual protocol/type/ID rather than an unrelated protocol-cell outpoint; membership remains bound to the current approval snapshot. Discovery does not wait for protocol transaction history, metrics, tipping or user history. Other new business routes use the original ProtocolProvider in its explicit current-cell mode and construct their scoped campaign services from fresh authorization snapshots, without mounting unrelated user/campaign/tipping/history providers. Legacy routes keep the default full provider tree. Current-cell loading has a deadline, retry and client-scope isolation.

New card covers only resolve near the viewport, share event-ID requests and Blob URLs, use a bounded queue and asynchronous per-event disk cache, and cache failures briefly. They do not rewrite the legacy whole-event localStorage cache. The legacy cover hook is unchanged. Idle Home updates once per minute or at an exact schedule boundary, pauses in hidden tabs, and resynchronizes on focus. New navigation and campaign links do not automatically prefetch unrelated routes.

Creation publishes campaign/quest metadata through the existing verified Nostr storage service, then builds the existing campaign transaction. Required-response flags extend off-chain quest-content v1 only; the on-chain schema is unchanged. An optional hidden HTML comment preserves the IANA campaign time zone. Legacy editors may remove that comment. Published quest identifiers and historical reward/acceptance state are preserved.

Submission and review use real signing, broadcast and confirmation signals. A transaction hash alone never produces a confirmed UI. Unresolved transactions block duplicate sends and can resume confirmation. Response HTML, links and files are rendered as untrusted evidence; exports escape spreadsheet formulas and Markdown. Organizer-authored quest requirements are validated before evidence display/export. Reviewer authorization/freshness reads have 12-second deadlines and the independent submission scan has a 30-second deadline, with retry and stale-scope protection.

Staff proxy signing validates current input assignments and exact Points/CKB/UDT claimable pools before signing. NFT reward approval is explicitly unavailable because the SDK has no corresponding payment builder; those submissions remain readable/exportable. Creation's full description remains required by existing business/contract validation although the Figma label does not mark it required.

Drafts/templates are local and scoped by network, protocol and wallet. Browser Back/Forward cannot reliably use the custom link-exit modal; unmount flushes the latest draft. Templates with asset rewards require the separate quota/funding flow and are explicitly blocked rather than silently dropping or funding assets. Legacy approval timestamps are unavailable; the UI states that limitation.

## Verification

From `dapp`, run `./node_modules/.bin/jest components/revamp/__tests__ lib/revamp/__tests__ netlify/lib/staff-authorization.test.ts netlify/lib/staff-claimable-rewards.test.ts netlify/__tests__/staff-approve-submissions.test.ts netlify/__tests__/staff-approve-submissions.integration.test.ts netlify/__tests__/isolated-protocol-scope.test.ts netlify/__tests__/platform-stats.test.ts --runInBand` for the focused interaction, isolation, role, data, evidence, transaction-boundary and real-codec proxy-handler suites. Run `./node_modules/.bin/jest --runInBand` for the complete dapp suite. The SDK authorization suites run from `packages/ssri-ckboost` with `pnpm exec jest --config sdk-auth.jest.config.cjs --runInBand`.

Run `./node_modules/.bin/tsc --noEmit --incremental false` separately from `NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build --webpack`. The repository config already sets `typescript.ignoreBuildErrors: true`; build success is not a clean type-check guarantee. The final type check retains 10 pre-existing tipping, profile and Netlify diagnostics; no new-code diagnostics remain.

Browser acceptance compares the supplied desktop frames and checks narrow layouts, Light/Dark, filters and direct-route access. Wallet-signing and on-chain permission behavior require the corresponding contract tests and an upgraded test deployment; no real wallet transaction is executed as part of visual QA.
