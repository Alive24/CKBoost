"use client";

import { useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { RevampButton } from "./ui";
import { assertTestnetDeploymentClient, deploymentReadDeadline } from "@/lib/revamp/testnet-code-deployment";
import { TESTNET_FUNDING_RECIPIENT_ADDRESS } from "@/lib/revamp/testnet-funding-transfer";
import { validateIsolatedTestnetProfile, prepareTestnetProtocolDeployment, type IsolatedTestnetProfileInput, type IsolatedTestnetProtocolProfile, type PreparedTestnetProtocolDeployment } from "@/lib/revamp/testnet-protocol-deployment";
import {
  signAndBroadcastTestnetProtocol, makePendingTestnetProtocolDeployment, parsePendingTestnetProtocolDeployments,
  parseSignedTestnetProtocolDiagnostics, probeTestnetProtocolConfirmation,
  CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError,
  type PendingTestnetProtocolDeployment, type SignedTestnetProtocolDiagnostic,
} from "@/lib/revamp/testnet-protocol-transactions";
import styles from "./testnet-setup-workspace.module.css";

const RECEIPTS_KEY = "ckboost-testnet-isolated-protocol-receipts-v1";
const DIAGNOSTICS_KEY = "ckboost-testnet-isolated-protocol-signed-diagnostics-v1";
const PROFILE_LIMIT = 65536;
type Confirmation = Awaited<ReturnType<typeof probeTestnetProtocolConfirmation>>;
const amount = (value: bigint) => `${ccc.fixedPointToString(value)} tCKB`;
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The isolated protocol operation could not complete. No automatic retry will occur.";

/** Separate, fixed Testnet bootstrap. It never activates a profile or spends an existing protocol cell. */
export function TestnetProtocolSetupWorkspace() {
  const signer = ccc.useSigner(), { client } = ccc.useCcc();
  const [wallet, setWallet] = useState<{ address: string; lockHash: string }>();
  const [walletError, setWalletError] = useState<string>(), [walletAttempt, setWalletAttempt] = useState(0);
  const [profile, setProfile] = useState<{ input: IsolatedTestnetProfileInput; normalized: IsolatedTestnetProtocolProfile }>();
  const [loadingProfile, setLoadingProfile] = useState(false), [phase, setPhase] = useState<"idle" | "preparing" | "wallet">("idle");
  const [prepared, setPrepared] = useState<PreparedTestnetProtocolDeployment>();
  const [error, setError] = useState<string>(), [notice, setNotice] = useState<string>();
  const [receipts, setReceipts] = useState<PendingTestnetProtocolDeployment[]>([]);
  const [diagnostics, setDiagnostics] = useState<SignedTestnetProtocolDiagnostic[]>([]);
  const [results, setResults] = useState<Record<string, Confirmation>>({});
  const [checking, setChecking] = useState<string>();
  const receiptsRef = useRef<PendingTestnetProtocolDeployment[]>([]), resultsRef = useRef<Record<string, Confirmation>>({});
  const mounted = useRef(true), busy = useRef(false), checkingRef = useRef(false), operation = useRef(0), checkVersion = useRef(0), profileVersion = useRef(0);
  const profileRequest = useRef<AbortController | undefined>(undefined);
  const scope = useRef({ signer, client }); scope.current = { signer, client };
  const matchesWallet = wallet?.address === TESTNET_FUNDING_RECIPIENT_ADDRESS;
  const blockedReceipt = () => receiptsRef.current.find(receipt => resultsRef.current[receipt.txHash]?.status !== "rejected");

  function restoreReceipts() {
    try { receiptsRef.current = parsePendingTestnetProtocolDeployments(localStorage.getItem(RECEIPTS_KEY)); if (mounted.current) setReceipts(receiptsRef.current); } catch { /* A required write still gates submission. */ }
  }
  useEffect(() => {
    mounted.current = true; restoreReceipts();
    try { setDiagnostics(parseSignedTestnetProtocolDiagnostics(localStorage.getItem(DIAGNOSTICS_KEY))); } catch { /* Public diagnostic recovery is optional. */ }
    const onStorage = (event: StorageEvent) => { if (event.key === RECEIPTS_KEY) restoreReceipts(); };
    window.addEventListener("storage", onStorage);
    return () => { mounted.current = false; operation.current++; checkVersion.current++; profileVersion.current++; profileRequest.current?.abort(); window.removeEventListener("storage", onStorage); };
  }, []);

  useEffect(() => {
    operation.current++; setPrepared(undefined); setWallet(undefined); setWalletError(undefined); setError(undefined);
    let active = true;
    if (signer) void (async () => {
      try {
        assertTestnetDeploymentClient(client); assertTestnetDeploymentClient(signer.client);
        const address = await deploymentReadDeadline(signer.getRecommendedAddressObj(), 12000);
        if (active && scope.current.signer === signer && scope.current.client === client) setWallet({ address: address.toString(), lockHash: address.script.hash() });
      } catch (cause) { if (active) setWalletError(message(cause)); }
    })();
    return () => { active = false; };
  }, [signer, client, walletAttempt]);

  async function loadProfile() {
    if (busy.current) return;
    operation.current++; const version = ++profileVersion.current;
    profileRequest.current?.abort(); const controller = new AbortController(); profileRequest.current = controller;
    let active = true;
    const isCurrent = () => active && mounted.current && profileVersion.current === version;
    setProfile(undefined); setPrepared(undefined); setLoadingProfile(true); setError(undefined); setNotice(undefined);
    const read = async () => {
      const response = await fetch("/revamp/testnet-setup/protocol-profile", { cache: "no-store", redirect: "error", signal: controller.signal });
      if (!isCurrent()) throw new Error("A newer isolated profile request replaced this read.");
      if (!response.ok) throw new Error(`The fixed isolated profile is not ready (HTTP ${response.status}). Both reviewed code cells must be confirmed first. Retry this read without signing.`);
      const declared = response.headers.get("content-length");
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > PROFILE_LIMIT)) throw new Error("The isolated profile exceeds its safe size bound.");
      let bytes: Uint8Array;
      if (response.body) {
        const reader = response.body.getReader(), output = new Uint8Array(PROFILE_LIMIT); let length = 0;
        try {
          while (true) {
            if (!isCurrent()) throw new Error("The isolated profile request changed.");
            const chunk = await reader.read(); if (chunk.done) break;
            if (length + chunk.value.length > PROFILE_LIMIT) throw new Error("The isolated profile exceeds its safe size bound.");
            output.set(chunk.value, length); length += chunk.value.length;
          }
          bytes = output.slice(0, length);
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      } else bytes = new Uint8Array(await response.arrayBuffer());
      if (!isCurrent()) throw new Error("The isolated profile request changed.");
      if (bytes.length > PROFILE_LIMIT) throw new Error("The isolated profile exceeds its safe size bound.");
      const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as IsolatedTestnetProfileInput;
      return { input, normalized: validateIsolatedTestnetProfile(input) };
    };
    try {
      const result = await deploymentReadDeadline(read(), 12000);
      if (isCurrent()) { setProfile(result); setNotice("The fixed profile structure and pinned code identities are valid. Prepare will independently recheck all live code cells and construct an unsigned protocol transaction."); }
    } catch (cause) { if (isCurrent()) setError(message(cause)); }
    finally { if (isCurrent()) setLoadingProfile(false); active = false; controller.abort(); }
  }

  function remember(receipt: PendingTestnetProtocolDeployment) {
    let existing = receiptsRef.current;
    try { existing = [...parsePendingTestnetProtocolDeployments(localStorage.getItem(RECEIPTS_KEY)), ...existing]; } catch { /* The mandatory write below must still succeed. */ }
    if (existing.some(item => item.txHash !== receipt.txHash && resultsRef.current[item.txHash]?.status !== "rejected")) throw new Error("Another isolated protocol transaction must be checked first. Submission was stopped before sending.");
    const unique = new Map(existing.filter(item => item.txHash !== receipt.txHash).map(item => [item.txHash, item]));
    const next = parsePendingTestnetProtocolDeployments(JSON.stringify([receipt, ...unique.values()].slice(0, 4)));
    if (!next.some(item => item.txHash === receipt.txHash)) throw new Error("The public isolated protocol receipt is invalid. Nothing was submitted.");
    try { localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next)); }
    catch { throw new Error("The browser could not save the public protocol receipt. Submission was stopped before sending. Free browser storage before preparing again."); }
    receiptsRef.current = next; if (mounted.current) setReceipts(next);
  }
  function rememberDiagnostic(snapshot: SignedTestnetProtocolDiagnostic) {
    const next = parseSignedTestnetProtocolDiagnostics(JSON.stringify([snapshot]));
    if (!next.some(item => item.transactionHash === snapshot.transactionHash)) throw new Error("The signed public protocol diagnostic could not be verified. Nothing was broadcast.");
    try { localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next)); } catch { /* The current session still offers a public download. */ }
    if (mounted.current) { setDiagnostics(next); setNotice("Protocol signature captured. Running read-only script verification before submission…"); }
  }
  function updateResult(result: Confirmation) {
    resultsRef.current = { ...resultsRef.current, [result.txHash]: result };
    if (mounted.current) setResults(resultsRef.current);
  }
  async function check(receipt: PendingTestnetProtocolDeployment) {
    if (checkingRef.current) return;
    checkingRef.current = true; const version = ++checkVersion.current;
    const isCurrent = () => mounted.current && checkVersion.current === version;
    setChecking(receipt.txHash);
    try { const result = await probeTestnetProtocolConfirmation(receipt, { isCurrent }); if (isCurrent()) updateResult(result); }
    catch (cause) { if (isCurrent()) { updateResult({ txHash: receipt.txHash, checkedAt: new Date().toISOString(), attempts: [], status: "unknown", reason: "transport", message: "The latest protocol check could not complete. Keep the saved receipt; do not create another state." }); setError(`${message(cause)} Keep the saved protocol receipt and check again; do not create another state while its status is unknown.`); } }
    finally { checkingRef.current = false; if (isCurrent()) setChecking(undefined); }
  }

  async function prepare() {
    if (!signer || !profile || !matchesWallet || busy.current || loadingProfile || checkingRef.current) return;
    restoreReceipts();
    if (blockedReceipt()) { setError("Check the saved isolated protocol transaction first. An unknown, pending, or confirmed protocol must not be recreated."); return; }
    busy.current = true; const version = ++operation.current, capturedProfile = profileVersion.current;
    const sourceSigner = signer, sourceClient = client; let active = true;
    const isCurrent = () => active && mounted.current && operation.current === version && profileVersion.current === capturedProfile && scope.current.signer === sourceSigner && scope.current.client === sourceClient;
    setPhase("preparing"); setPrepared(undefined); setError(undefined); setNotice("Reading nine live code cells, the local SSRI executor, and empty wallet capacity cells. No wallet signature is requested.");
    try {
      const result = await deploymentReadDeadline(prepareTestnetProtocolDeployment(signer, profile.input, isCurrent), 120000);
      if (isCurrent()) { setPrepared(result); setNotice("Unsigned isolated protocol prepared. Review its sole admin, code identities, actual cell capacity, and fee before requesting a signature."); }
    } catch (cause) { if (isCurrent()) setError(message(cause)); }
    finally { active = false; busy.current = false; if (mounted.current) setPhase("idle"); }
  }

  async function sign() {
    if (!signer || !prepared || !matchesWallet || busy.current || loadingProfile || checkingRef.current) return;
    restoreReceipts(); if (blockedReceipt()) { setError("Check the existing protocol receipt before requesting another signature."); return; }
    busy.current = true; const version = ++operation.current, capturedProfile = profileVersion.current;
    const sourceSigner = signer, sourceClient = client;
    const isCurrent = () => mounted.current && operation.current === version && profileVersion.current === capturedProfile && scope.current.signer === sourceSigner && scope.current.client === sourceClient;
    let captured: PendingTestnetProtocolDeployment | undefined;
    setPhase("wallet"); setError(undefined); setNotice("Review this new isolated protocol state in your connected wallet. Canceling sends nothing; this never changes the shared protocol.");
    try {
      const hash = await signAndBroadcastTestnetProtocol(signer, prepared, isCurrent, { onSignedDiagnostic: rememberDiagnostic, onBeforeBroadcast: receipt => { remember(receipt); captured = receipt; } });
      const receipt = captured ?? makePendingTestnetProtocolDeployment(prepared, hash); if (!captured) remember(receipt);
      if (!isCurrent()) return;
      setPrepared(undefined); setNotice("Protocol transaction submitted. Checking its status once; the public receipt remains available after refresh."); await check(receipt);
    } catch (cause) {
      if (cause instanceof CodeBroadcastStatusUnknownError || cause instanceof CodeDeploymentRejectedError && cause.stage === "broadcast") {
        const receipt = captured ?? makePendingTestnetProtocolDeployment(prepared, cause.txHash); if (!captured) remember(receipt);
        // The raw node result remains authoritative; a later explicit read can unlock a rejected receipt.
        if (isCurrent()) setNotice(cause instanceof CodeBroadcastStatusUnknownError ? "Protocol broadcast status is unknown. Check the saved transaction before another signature; do not resend." : "The node rejected this protocol transaction. Its public receipt is retained. Check its status before preparing again.");
      }
      if (isCurrent()) {
        setError(cause instanceof CodeBroadcastStatusUnknownError ? "The isolated protocol may have been submitted. Check the saved public receipt; no automatic resend will occur." : message(cause));
        if (cause instanceof CodeDeploymentPreflightError || cause instanceof CodeDeploymentRejectedError && cause.stage === "preflight") setNotice("Read-only protocol verification failed. Nothing was broadcast. The signed public diagnostic is available below for inspection.");
        if (captured || cause instanceof CodeDeploymentPreflightError || cause instanceof CodeDeploymentRejectedError) setPrepared(undefined);
      }
    } finally { busy.current = false; if (mounted.current) setPhase("idle"); }
  }

  function download(value: unknown, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })), link = document.createElement("a");
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const disabled = phase !== "idle" || loadingProfile || Boolean(checking), blocking = blockedReceipt();
  const reasons = [phase !== "idle" ? "Another isolated protocol operation is running." : undefined, loadingProfile ? "The fixed profile is loading." : !profile ? "Load the fixed isolated profile first; both new code cells must already be confirmed." : undefined, !signer ? "Connect your funded Testnet deployment wallet using the wallet control above." : walletError ? `Wallet check failed: ${walletError}` : !wallet ? "Checking the connected Testnet wallet…" : !matchesWallet ? "The connected wallet does not match your specified funded deployment address. Select that wallet using the control above." : undefined, checking ? "A protocol receipt status check is running." : undefined, blocking ? results[blocking.txHash]?.status === "confirmed" ? "An isolated protocol is already confirmed. Export its manifest instead of creating another state." : "A saved protocol transaction is pending, unknown, or not yet checked. Check it below before preparing another state." : undefined].filter((item): item is string => Boolean(item));
  const newCodes = profile?.normalized.dependencies.filter(item => item.name === "ckboostProtocolLock" || item.name === "ckboostCampaignType");
  return <section className={styles.panel} aria-label="Isolated Testnet protocol setup">
    <h2>5. Create a new isolated Testnet protocol state</h2>
    <p>This creates one separate protocol state using the two confirmed reviewed code cells. It never spends or updates the existing shared protocol and does not activate this new state in the app.</p>
    <dl className={styles.facts}><dt>Required funding wallet</dt><dd className={styles.code}>{TESTNET_FUNDING_RECIPIENT_ADDRESS}</dd><dt>Connected owner</dt><dd className={styles.code}>{wallet?.address ?? (signer ? "Checking wallet…" : "No wallet connected")}</dd><dt>Wallet match</dt><dd>{wallet ? matchesWallet ? "Matches the specified deployment wallet" : "Different from the specified deployment wallet" : "Not verified"}</dd></dl>
    {walletError && <RevampButton variant="secondary" disabled={disabled} onClick={() => setWalletAttempt(value => value + 1)}>Retry protocol wallet check</RevampButton>}
    <RevampButton variant="secondary" disabled={phase !== "idle" || Boolean(checking)} onClick={() => void loadProfile()}>Load verified isolated profile · no signing</RevampButton>
    {profile && <div className={styles.receipt}><h3>Fixed isolated profile loaded</h3><p>The seven reusable dependencies and both reviewed code releases match their pins. Preparation verifies their live on-chain identities again.</p><p className={styles.code}>Local compatibility executor: {profile.normalized.executorUrl}</p>{newCodes?.map(item => <article key={item.name}><h3>{item.name === "ckboostProtocolLock" ? "New Protocol lock code" : "New Campaign type code"}</h3><p className={styles.code}>Type hash: {item.codeHash}</p><p className={styles.code}>Outpoint: {item.outPoint.txHash}:{item.outPoint.index}</p><p className={styles.code}>Reviewed data hash: {item.dataHash}</p></article>)}</div>}
    <div id="isolated-protocol-prepare-reasons" role="status" aria-live="polite">{reasons.length ? <ul className={styles.list}>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p className={styles.success}>Ready for unsigned protocol preparation. No approvals or Organizer memberships will be created.</p>}</div>
    <RevampButton variant="secondary" disabled={reasons.length > 0} aria-describedby="isolated-protocol-prepare-reasons" onClick={() => void prepare()}>Prepare unsigned isolated protocol</RevampButton>
    {notice && <p role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    {prepared && <div className={styles.receipt} aria-label="Unsigned isolated protocol preview"><h3>Review the new protocol state</h3><dl className={styles.facts}>
      <dt>New protocol Type ID args</dt><dd className={styles.code}>{prepared.typeScript.args}</dd><dt>Protocol type code hash</dt><dd className={styles.code}>{prepared.typeScript.codeHash}</dd><dt>New protocol type hash</dt><dd className={styles.code}>{prepared.typeHash}</dd><dt>Protocol state lock code hash</dt><dd className={styles.code}>{prepared.tx.outputs[0].lock.codeHash}</dd><dt>Sole admin / owner</dt><dd className={styles.code}>{prepared.walletAddress}</dd><dt>Admin lock hash</dt><dd className={styles.code}>{prepared.walletLock.hash()}</dd><dt>Protocol cell capacity</dt><dd className={styles.amount}>{amount(prepared.capacity)}</dd><dt>Estimated network fee</dt><dd>{amount(prepared.fee)} ({prepared.fee.toString()} shannons)</dd><dt>Capacity + fee</dt><dd>{amount(prepared.capacity + prepared.fee)}</dd><dt>Initial memberships</dt><dd>0 Organizers · 0 approved campaigns · 0 approved tippings</dd><dt>Protocol data hash</dt><dd className={styles.code}>{prepared.dataHash}</dd>
    </dl><p>Only live empty untyped cells from the specified funding wallet are consumed. Other outputs return empty change to that wallet. No existing code cell or protocol state is consumed.</p><RevampButton disabled={disabled || !matchesWallet || Boolean(blocking)} onClick={() => void sign()}>Sign and create new isolated protocol state</RevampButton></div>}
    {receipts.length > 0 && <div className={styles.receipt} aria-label="Isolated protocol receipts"><h3>Saved isolated protocol receipts</h3><p>Refresh clears the unsigned preview, but public receipts remain. Status checks never sign or submit again.</p>{receipts.map(receipt => { const result = results[receipt.txHash]; return <article className={styles.receipt} key={receipt.txHash}>
      <a className={styles.code} href={`https://pudge.explorer.nervos.org/transaction/${receipt.txHash}`} target="_blank" rel="noreferrer">{receipt.txHash}</a>
      <p role="status" className={result?.status === "confirmed" ? styles.success : result?.status === "rejected" ? styles.error : undefined}>{checking === receipt.txHash ? "Checking the saved protocol through public Testnet HTTPS…" : result?.status === "confirmed" ? "Committed. The new isolated protocol state is verified. This does not activate it or change the shared protocol." : result?.status === "rejected" ? `The node rejected this protocol transaction. ${result.reason}` : result?.message ?? "Not yet verified in this session. Check before preparing another state."}</p>
      {result?.status === "confirmed" && <RevampButton variant="secondary" onClick={() => download(result.manifest, `ckboost-isolated-testnet-protocol-${receipt.txHash.slice(2, 10)}.json`)}>Export confirmed isolated protocol manifest</RevampButton>}
      <RevampButton variant="secondary" disabled={disabled} onClick={() => void check(receipt)}>Check protocol status · no signing</RevampButton>
    </article>; })}</div>}
    {diagnostics.length > 0 && <div className={styles.receipt} aria-label="Signed isolated protocol diagnostics"><h3>Signed protocol diagnostics</h3><p className={styles.muted}>Public signed bytes for offline inspection; no private key. A diagnostic does not prove submission or confirmation. Downloading never signs or sends.</p>{diagnostics.map(snapshot => <article key={snapshot.transactionHash}><p className={styles.code}>{snapshot.transactionHash}</p><RevampButton variant="secondary" onClick={() => download(snapshot, `ckboost-isolated-testnet-protocol-signed-diagnostic-${snapshot.transactionHash.slice(2, 10)}.json`)}>Download signed protocol diagnostic</RevampButton></article>)}</div>}
  </section>;
}
