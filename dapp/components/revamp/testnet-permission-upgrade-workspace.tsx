"use client";

import { useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { RevampButton } from "./ui";
import { PERMISSION_REVIEW_RELEASES } from "@/lib/ckb/permissions-release-pins.mjs";
import { PERMISSION_UPGRADE_IDS, preparePermissionUpgrade, REVIEWER_ACCOUNT4, REVIEWER_TEST_CAPACITY, signPermissionUpgrade, type PermissionUpgradeDiagnostic, type PreparedPermissionUpgrade, type UpgradeBytes } from "@/lib/revamp/testnet-permission-upgrade";
import { probePermissionUpgrade, type PermissionUpgradeConfirmation } from "@/lib/revamp/testnet-permission-upgrade-confirmation";
import styles from "./testnet-permission-upgrade.module.css";

const RECEIPT_KEY = "ckboost:qa-permission-upgrade:v1";
const DIAGNOSTIC_KEY = "ckboost:qa-permission-upgrade-signed:v1";
const amount = (n: bigint) => `${n / 100_000_000n}.${(n % 100_000_000n).toString().padStart(8, "0")}`.replace(/\.?0+$/, "");
function parseHash(raw: string | null): ccc.Hex | null { return raw && /^0x[0-9a-f]{64}$/.test(raw) ? raw as ccc.Hex : null; }

/** Local operator page. It has no access to a private key and is not mounted
 * in the independent business-flow build (setup flag must be explicitly on). */
export function TestnetPermissionUpgradeWorkspace() {
  const signer = ccc.useSigner();
  const { open } = ccc.useCcc();
  const scope = useRef({ signer, revision: 0 });
  if (scope.current.signer !== signer) scope.current = { signer, revision: scope.current.revision + 1 };
  const mounted = useRef(true), inFlight = useRef(false);
  const [address, setAddress] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [prepared, setPrepared] = useState<PreparedPermissionUpgrade | null>(null);
  const [savedHash, setSavedHash] = useState<ccc.Hex | null>(null), [diagnostic, setDiagnostic] = useState<PermissionUpgradeDiagnostic | null>(null);
  const [confirmation, setConfirmation] = useState<PermissionUpgradeConfirmation | null>(null);
  useEffect(() => { mounted.current = true; setSavedHash(parseHash(localStorage.getItem(RECEIPT_KEY))); return () => { mounted.current = false; }; }, []);
  useEffect(() => { let stale = false; setPrepared(null); setAddress(null); if (signer) void signer.getRecommendedAddressObj().then(value => { if (!stale) setAddress(value.toString()); }).catch(() => {}); return () => { stale = true; }; }, [signer]);

  const operation = () => { const captured = scope.current; return () => mounted.current && scope.current === captured; };
  async function prepare() {
    if (!signer || inFlight.current || savedHash) return;
    inFlight.current = true; setBusy(true); setError(null); setPrepared(null);
    const current = operation();
    try {
      const binaries = {} as UpgradeBytes;
      await Promise.all(PERMISSION_UPGRADE_IDS.map(async id => {
        const response = await fetch(`/revamp/testnet-code-upgrade/release/${id}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error("The reviewed local permissions release is unavailable.");
        const pin = PERMISSION_REVIEW_RELEASES[id];
        if (!pin || response.headers.get("content-length") !== String(pin.byteLength)) throw new Error("Unexpected reviewed release size.");
        binaries[id] = new Uint8Array(await response.arrayBuffer());
      }));
      if (!current()) return;
      const result = await preparePermissionUpgrade(signer, binaries, current);
      if (current()) setPrepared(result);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "Preparation failed. Nothing was signed."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function upgrade() {
    if (!signer || !prepared || inFlight.current || savedHash) return;
    inFlight.current = true; setBusy(true); setError(null);
    const current = operation(); let broadcastAttempted = false;
    try {
      await signPermissionUpgrade(signer, prepared, snapshot => {
        localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(snapshot));
        if (current()) setDiagnostic(snapshot);
      }, current, hash => {
        // Save before send; a dropped HTTP response must never cause a second
        // wallet signature just because this page was refreshed.
        localStorage.setItem(RECEIPT_KEY, hash); broadcastAttempted = true;
        if (mounted.current) setSavedHash(hash);
      });
      if (mounted.current) setPrepared(null);
    } catch (cause) {
      if (mounted.current) setError(`${cause instanceof Error ? cause.message : "Upgrade stopped."} ${broadcastAttempted ? "Submission may have occurred. Check the saved hash; do not sign again." : "No broadcast was attempted."}`);
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function check() {
    if (!savedHash || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { const result = await probePermissionUpgrade(savedHash); if (mounted.current) setConfirmation(result); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Confirmation unavailable."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const download = (value: unknown, name: string) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

  return <main className={styles.workspace}>
    <p className={styles.eyebrow}>LOCAL OPERATOR TOOL · CKB TESTNET ONLY</p>
    <h1>Upgrade the dedicated QA contracts</h1>
    <p>Account 1 signs one transaction. It upgrades only the two code cells created for this test and transfers 1,000 tCKB to Account 4 for Reviewer testing.</p>
    <section className={styles.card}>
      <h2>1. Connect Account 1</h2>
      <p>The connected CKB address must end in <strong>2rlz</strong>.</p>
      <p className={styles.address}>{address ?? "No wallet connected"}</p>
      <RevampButton variant="secondary" onClick={() => open()} disabled={busy}>Open connected wallet</RevampButton>
    </section>
    <section className={styles.card}>
      <h2>2. Prepare the reviewed upgrade</h2>
      <p>The two existing TypeIDs and their Account 1 ownership remain the same. The test protocol, campaign IDs and Account 2 submission are retained.</p>
      <div className={styles.codes}>{PERMISSION_UPGRADE_IDS.map(id => { const pin = PERMISSION_REVIEW_RELEASES[id]; return <div key={id}><strong>{pin?.name}</strong><p>{pin?.byteLength.toLocaleString()} bytes</p><code>{pin?.dataHash}</code></div>; })}</div>
      <p>Account 4 receives <strong>1,000 tCKB</strong> at <code>{new ccc.Address(ccc.Script.from(REVIEWER_ACCOUNT4), "ckt").toString()}</code>.</p>
      <RevampButton variant="secondary" onClick={() => void prepare()} disabled={!signer || busy || Boolean(savedHash)}>Load reviewed releases &amp; prepare · no signing</RevampButton>
    </section>
    {prepared && !savedHash && <section className={styles.card}>
      <h2>3. Review and sign once</h2>
      <dl><dt>Additional code-cell capacity</dt><dd>{amount(prepared.additionalCodeCapacity)} tCKB</dd><dt>Transfer to Account 4</dt><dd>{amount(REVIEWER_TEST_CAPACITY)} tCKB</dd><dt>Network fee</dt><dd>{amount(prepared.fee)} tCKB</dd><dt>Transaction</dt><dd className={styles.address}>{prepared.bodyHash}</dd></dl>
      <p>Only the two QA code inputs and ordinary Account 1 capacity are spent. Old online contracts, protocol state, campaigns, UserCells and other assets cannot be selected by this tool.</p>
      <RevampButton onClick={() => void upgrade()} disabled={busy}>Upgrade QA contracts &amp; fund Account 4 · sign once</RevampButton>
    </section>}
    {savedHash && <section className={styles.card}>
      <h2>4. Confirm · no signing</h2>
      <a href={`https://testnet.explorer.nervos.org/transaction/${savedHash}`} target="_blank" rel="noreferrer" className={styles.address}>{savedHash}</a>
      <p>{confirmation?.status === "confirmed" ? "Both upgraded code cells and their actual inputs have been independently verified." : confirmation?.message ?? "Submission is saved. Check confirmation before any further wallet action."}</p>
      <RevampButton variant="secondary" disabled={busy} onClick={() => void check()}>Check confirmation</RevampButton>
      {confirmation?.status === "confirmed" && <RevampButton variant="secondary" onClick={() => download(confirmation.manifests, "ckboost-qa-permissions-upgrade-manifests.json")}>Export confirmed manifests</RevampButton>}
    </section>}
    {diagnostic && <section className={styles.card}><p>Public signed transaction bytes are saved locally for diagnosis. This file contains no wallet private key.</p><RevampButton variant="secondary" onClick={() => download(diagnostic, "ckboost-qa-permissions-signed.json")}>Download signed diagnostic</RevampButton></section>}
    {busy && <p role="status">Working… Please complete the wallet request if one is open.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </main>;
}
