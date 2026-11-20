"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import { RevampButton } from "./ui";
import {
  TESTNET_CODE_RELEASES, TESTNET_JOYID_CODE_HASH, TESTNET_JOYID_RAW_LIMIT, CodeBroadcastStatusUnknownError, CodeDeploymentRejectedError, CodeDeploymentPreflightError, assertTestnetDeploymentClient, deploymentReadDeadline, getTestnetCodeCapacity,
  makePendingCodeDeployment, parsePendingCodeDeployments, parseSignedCodeDeploymentDiagnostics,
  prepareTestnetCodeDeployment, signAndBroadcastTestnetCode, validateTestnetRelease,
  type ConfirmedCodeManifest, type PendingCodeDeployment, type PreparedCodeDeployment, type TestnetCodeId, type SignedCodeDeploymentDiagnostic,
} from "@/lib/revamp/testnet-code-deployment";
import { probeTestnetCodeConfirmation } from "@/lib/revamp/testnet-code-confirmation";
import { TESTNET_FUNDING_RECIPIENT_ADDRESS } from "@/lib/revamp/testnet-funding-transfer";
import { TestnetFundingTransferWorkspace } from "./testnet-funding-transfer-workspace";
import { TestnetProtocolSetupWorkspace } from "./testnet-protocol-setup-workspace";
import styles from "./testnet-setup-workspace.module.css";

const RECEIPTS_KEY = "ckboost-testnet-code-receipts-v1";
const DIAGNOSTICS_KEY = "ckboost-testnet-code-signed-diagnostics-v1";
const IDS: TestnetCodeId[] = ["protocol-lock", "campaign-type", "user-type"];
const amount = (value: bigint) => `${ccc.fixedPointToString(value)} tCKB`;
const message = (error: unknown) => error instanceof Error ? error.message : "The operation failed. No automatic retry will be performed.";
type Upload = { bytes?: Uint8Array; fileName?: string; error?: string; reading?: boolean; source?: "manual" | "local-service" };

export function TestnetSetupWorkspace() {
  const signer = ccc.useSigner();
  const { client, open, wallet: connectedWallet } = ccc.useCcc();
  const [wallet, setWallet] = useState<{ address: string; lock: ccc.Script }>();
  const [walletError, setWalletError] = useState<string>();
  const [walletAttempt, setWalletAttempt] = useState(0);
  const [uploads, setUploads] = useState<Partial<Record<TestnetCodeId, Upload>>>({});
  const [prepared, setPrepared] = useState<PreparedCodeDeployment>();
  const [phase, setPhase] = useState<"idle" | "preparing" | "wallet" | "confirming">("idle");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [receipts, setReceipts] = useState<PendingCodeDeployment[]>([]);
  const receiptsRef = useRef<PendingCodeDeployment[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, ConfirmedCodeManifest>>({});
  const [confirmationErrors, setConfirmationErrors] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<string>();
  const [chainStates, setChainStates] = useState<Record<string, { status: "pending" | "rejected" | "unknown"; message: string }>>({});
  const [diagnostics, setDiagnostics] = useState<SignedCodeDeploymentDiagnostic[]>([]);
  const diagnosticsRef = useRef<SignedCodeDeploymentDiagnostic[]>([]);
  const checkingRef = useRef(false);
  const confirmationOperation = useRef(0);
  const operation = useRef(0);
  const fileOperations = useRef({ "protocol-lock": 0, "campaign-type": 0, "user-type": 0 });
  const fileDownloads = useRef<Partial<Record<TestnetCodeId, AbortController>>>({});
  const busy = useRef(false);
  const mounted = useRef(true);
  const scope = useRef({ signer, client });
  scope.current = { signer, client };
  const blockingReceipt = (id: TestnetCodeId) => receiptsRef.current.find(receipt => receipt.id === id && (confirmed[receipt.txHash] || chainStates[receipt.txHash]?.status !== "rejected"));
  const isCurrentTestnetJoyId = wallet?.lock.hashType === "type" && wallet.lock.codeHash.toLowerCase() === TESTNET_JOYID_CODE_HASH;
  // Each binary alone exceeds this known lock's limit; the backend also checks the entire actual raw transaction.
  const unsupportedDeployment = (id: TestnetCodeId) => Boolean(isCurrentTestnetJoyId && TESTNET_CODE_RELEASES[id].byteLength > TESTNET_JOYID_RAW_LIMIT);
  const hasUnsupportedDeployment = IDS.some(unsupportedDeployment);

  /** The visible explanation and the explicit Prepare action use the same complete gate. */
  function preparationBlockers(id: TestnetCodeId): string[] {
    const reasons: string[] = [], upload = uploads[id], release = TESTNET_CODE_RELEASES[id];
    if (busy.current || phase !== "idle") reasons.push("Another deployment operation is in progress. Wait for it to finish before preparing a transaction.");
    if (checking) reasons.push("A saved transaction status check is in progress. Wait for its result.");
    if (!signer) reasons.push("Connect a Testnet wallet using Connect wallet above.");
    else if (walletError) reasons.push(`The connected wallet could not be verified: ${walletError} Use Retry wallet check in Step 1.`);
    else if (!wallet) reasons.push("Checking the connected Testnet wallet. Preparation becomes available when this read finishes.");
    if (id === "user-type" && wallet && wallet.address !== TESTNET_FUNDING_RECIPIENT_ADDRESS) reasons.push("The independent UserType must be owned by your specified deployment Admin wallet. Select that wallet above.");
    if (unsupportedDeployment(id)) reasons.push(`This connected JoyID lock cannot deploy this ${release.byteLength.toLocaleString("en-US")}-byte binary: it exceeds the verified 128 KiB raw-transaction limit. Choose a compatible deployment wallet using Open connected wallet above.`);
    if (upload?.reading) reasons.push("Validating the selected local release file. Wait for Verified release before preparing.");
    else if (upload?.error) reasons.push(`The selected release file is invalid: ${upload.error} Select the reviewed ${release.fileName} file again.`);
    else if (!upload?.bytes) reasons.push(`Load the reviewed ${release.fileName} using Load reviewed release, or select it manually in Step 2, and wait for Verified release. Refreshing clears selected files and unsigned preparation; load or select the file again after a refresh.`);
    for (const receipt of receiptsRef.current.filter(item => item.id === id)) {
      if (confirmed[receipt.txHash]) reasons.push(`Saved transaction ${receipt.txHash} is confirmed for this artifact. A matching live code cell already exists; use its manifest in Step 4 instead of deploying another copy.`);
      else if (chainStates[receipt.txHash]?.status !== "rejected") {
        const state = chainStates[receipt.txHash]?.status;
        reasons.push(`Saved transaction ${receipt.txHash} ${state === "pending" ? "is pending" : state === "unknown" ? "has unknown status" : "has not been verified in this session"}. Check it in Step 4 before preparing another copy, including when its owner is a previous wallet.`);
      }
    }
    return reasons;
  }

  function receiptOwner(receipt: PendingCodeDeployment) {
    return new ccc.Address(ccc.Script.from(receipt.walletLock), "ckt").toString();
  }

  useEffect(() => {
    mounted.current = true;
    try { receiptsRef.current = parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY)); setReceipts(receiptsRef.current); } catch { /* Public receipt storage is optional. */ }
    try { diagnosticsRef.current = parseSignedCodeDeploymentDiagnostics(localStorage.getItem(DIAGNOSTICS_KEY)); setDiagnostics(diagnosticsRef.current); } catch { /* Signed public payload storage is optional. */ }
    return () => { mounted.current = false; operation.current++; confirmationOperation.current++; IDS.forEach(id => fileDownloads.current[id]?.abort()); };
  }, []);

  useEffect(() => {
    operation.current++;
    setPrepared(undefined); setWallet(undefined); setWalletError(undefined); setError(undefined);
    let active = true;
    if (!signer) return;
    async function readWallet() {
      try {
        assertTestnetDeploymentClient(client);
        assertTestnetDeploymentClient(signer!.client);
        const address = await deploymentReadDeadline(signer!.getRecommendedAddressObj(), 12000);
        if (active && scope.current.signer === signer && scope.current.client === client) setWallet({ address: address.toString(), lock: address.script });
      } catch (cause) { if (active) setWalletError(message(cause)); }
    }
    void readWallet();
    return () => { active = false; };
  }, [signer, client, walletAttempt]);

  async function chooseFile(id: TestnetCodeId, file?: File) {
    if (busy.current) return;
    fileDownloads.current[id]?.abort();
    operation.current++; setPrepared(undefined); setError(undefined); setNotice(undefined);
    const version = ++fileOperations.current[id];
    setUploads(current => ({ ...current, [id]: file ? { reading: true, fileName: file.name, source: "manual" } : {} }));
    if (!file) return;
    try {
      if (file.size !== TESTNET_CODE_RELEASES[id].byteLength) throw new Error(`Select the reviewed ${TESTNET_CODE_RELEASES[id].fileName} release (${TESTNET_CODE_RELEASES[id].byteLength.toLocaleString("en-US")} bytes).`);
      const bytes = new Uint8Array(await deploymentReadDeadline(file.arrayBuffer(), 12000));
      if (!mounted.current || fileOperations.current[id] !== version) return;
      validateTestnetRelease(id, bytes);
      if (mounted.current && fileOperations.current[id] === version) setUploads(current => ({ ...current, [id]: { bytes, fileName: file.name, source: "manual" } }));
    } catch (cause) {
      if (mounted.current && fileOperations.current[id] === version) setUploads(current => ({ ...current, [id]: { fileName: file.name, error: message(cause) } }));
    }
  }

  async function loadReviewedRelease(id: TestnetCodeId) {
    if (busy.current) return;
    operation.current++; setPrepared(undefined); setError(undefined); setNotice(undefined);
    const version = ++fileOperations.current[id], release = TESTNET_CODE_RELEASES[id];
    fileDownloads.current[id]?.abort();
    const controller = new AbortController(); fileDownloads.current[id] = controller;
    let active = true;
    const isCurrent = () => active && mounted.current && fileOperations.current[id] === version;
    setUploads(current => ({ ...current, [id]: { reading: true, fileName: release.fileName, source: "local-service" } }));
    const read = async () => {
      const response = await fetch(`/revamp/testnet-setup/release/${id}`, { cache: "no-store", redirect: "error", signal: controller.signal });
      if (!isCurrent()) throw new Error("A newer release selection replaced this download.");
      if (!response.ok) throw new Error(`The local reviewed release could not be loaded (HTTP ${response.status}). Retry, or select the reviewed file manually.`);
      const length = response.headers.get("content-length");
      if (!length || !/^\d+$/.test(length) || Number(length) !== release.byteLength) throw new Error(`The local release size does not match the reviewed ${release.byteLength.toLocaleString("en-US")}-byte binary. No file was accepted.`);
      let bytes: Uint8Array;
      if (response.body) {
        const reader = response.body.getReader(), output = new Uint8Array(release.byteLength); let received = 0;
        try {
          while (true) {
            if (!isCurrent()) throw new Error("A newer release selection replaced this download.");
            const chunk = await reader.read();
            if (chunk.done) break;
            if (received + chunk.value.length > output.length) throw new Error("The local release exceeded the reviewed size. No file was accepted.");
            output.set(chunk.value, received); received += chunk.value.length;
          }
          if (received !== output.length) throw new Error("The local release download is incomplete. Retry, or select the reviewed file manually.");
          bytes = output;
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      } else {
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      if (!isCurrent()) throw new Error("A newer release selection replaced this download.");
      if (bytes.length !== release.byteLength) throw new Error("The local release download is incomplete or has the wrong size. No file was accepted.");
      validateTestnetRelease(id, bytes); return bytes;
    };
    try {
      const bytes = await deploymentReadDeadline(read(), 12000);
      if (isCurrent()) setUploads(current => ({ ...current, [id]: { bytes, fileName: release.fileName, source: "local-service" } }));
    } catch (cause) {
      if (isCurrent()) setUploads(current => ({ ...current, [id]: { fileName: release.fileName, error: `${message(cause)} Use Load reviewed release to retry, or select the reviewed file manually.` } }));
    } finally {
      active = false; controller.abort();
      if (fileDownloads.current[id] === controller) delete fileDownloads.current[id];
    }
  }

  async function prepare(id: TestnetCodeId) {
    const reasons = preparationBlockers(id);
    if (reasons.length) { setError(reasons.join(" ")); return; }
    if (!signer) return;
    busy.current = true;
    const version = ++operation.current;
    const currentSigner = signer, currentClient = client;
    let active = true;
    const isCurrent = () => active && mounted.current && operation.current === version &&
      scope.current.signer === currentSigner && scope.current.client === currentClient;
    setPhase("preparing"); setPrepared(undefined); setError(undefined); setNotice(undefined);
    try {
      const result = await deploymentReadDeadline(prepareTestnetCodeDeployment(signer, id, uploads[id]!.bytes!, isCurrent), 30000);
      if (isCurrent()) { setPrepared(result); setNotice("Prepared without signing. Review the exact capacity and network fee below."); }
    } catch (cause) { if (isCurrent()) setError(message(cause)); }
    finally { active = false; busy.current = false; if (mounted.current) setPhase("idle"); }
  }

  function remember(receipt: PendingCodeDeployment) {
    let saved = receiptsRef.current;
    try { saved = [...parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY)), ...saved]; } catch { /* Storage is optional. */ }
    const unique = new Map(saved.filter(item => item.txHash !== receipt.txHash).map(item => [item.txHash, item]));
    const next = [receipt, ...unique.values()].slice(0, 16);
    receiptsRef.current = next;
    try { localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next)); } catch { /* The transaction hash stays visible even without persistence. */ }
    if (mounted.current) setReceipts(next);
  }

  function rememberDiagnostic(snapshot: SignedCodeDeploymentDiagnostic) {
    const next = parseSignedCodeDeploymentDiagnostics(JSON.stringify([snapshot, ...diagnosticsRef.current.filter(item => item.contract !== snapshot.contract)].slice(0, 2)));
    if (!next.some(item => item.transactionHash === snapshot.transactionHash)) throw new Error("The signed public transaction could not be verified for diagnostic export. Nothing was broadcast.");
    diagnosticsRef.current = next;
    try { localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next)); } catch { /* The current session still offers a diagnostic download. */ }
    if (mounted.current) {
      setDiagnostics(next);
      setNotice("Wallet signature captured. Running read-only Testnet script verification before submission…");
    }
  }

  async function confirm(receipt: PendingCodeDeployment) {
    if (checkingRef.current) return;
    checkingRef.current = true;
    const version = ++confirmationOperation.current;
    const isCurrent = () => mounted.current && confirmationOperation.current === version;
    setChecking(receipt.txHash);
    setConfirmationErrors(current => ({ ...current, [receipt.txHash]: "" }));
    try {
      const result = await probeTestnetCodeConfirmation(receipt, { isCurrent });
      if (!isCurrent()) return;
      if (result.status === "confirmed") {
        setConfirmed(current => ({ ...current, [receipt.txHash]: result.manifest }));
        setChainStates(current => { const next = { ...current }; delete next[receipt.txHash]; return next; });
      } else {
        setConfirmed(current => { const next = { ...current }; delete next[receipt.txHash]; return next; });
        setChainStates(current => ({ ...current, [receipt.txHash]: { status: result.status, message: result.status === "rejected" ? `Node rejected this transaction. No code cell was deployed. ${result.reason}` : result.message } }));
      }
    } catch (cause) {
      if (isCurrent()) setConfirmationErrors(current => ({ ...current, [receipt.txHash]: `${message(cause)} Check the saved transaction before attempting another deployment.` }));
    } finally { checkingRef.current = false; if (isCurrent()) setChecking(undefined); }
  }

  async function deploy() {
    if (!signer || !prepared || busy.current) return;
    if (unsupportedDeployment(prepared.id)) { setError("This code deployment exceeds the connected Testnet JoyID lock's verified size limit. No additional wallet request was made. Choose a compatible funding wallet to continue."); return; }
    if (blockingReceipt(prepared.id)) { setError("Check the existing receipt before requesting another wallet signature for this contract."); return; }
    busy.current = true;
    const version = ++operation.current;
    const currentSigner = signer, currentClient = client;
    const isCurrent = () => mounted.current && operation.current === version && scope.current.signer === currentSigner && scope.current.client === currentClient;
    setPhase("wallet"); setError(undefined); setNotice("Review this new code cell deployment in your connected wallet. Canceling sends nothing.");
    try {
      // This is the only entry point that can sign and broadcast. It is never called by an effect.
      const txHash = await signAndBroadcastTestnetCode(signer, prepared, isCurrent, { onSignedDiagnostic: rememberDiagnostic });
      const receipt = makePendingCodeDeployment(prepared, txHash);
      remember(receipt);
      if (!mounted.current) return;
      setPrepared(undefined);
      setNotice("Broadcast to Testnet. Wait for committed confirmation before exporting; retrying confirmation never signs again.");
      setPhase("confirming");
      await confirm(receipt);
    } catch (cause) {
      if (cause instanceof CodeDeploymentRejectedError) {
        if (cause.stage === "broadcast") {
          remember(makePendingCodeDeployment(prepared, cause.txHash));
          if (mounted.current) setChainStates(current => ({ ...current, [cause.txHash]: { status: "rejected", message: cause.message } }));
        }
        if (mounted.current) { setPrepared(undefined); setNotice(cause.stage === "preflight" ? "Read-only script verification failed. Nothing was broadcast. Download the signed transaction diagnostic below." : "The node rejected submission. This transaction is not waiting for confirmation."); }
      } else if (cause instanceof CodeDeploymentPreflightError) {
        if (mounted.current) { setPrepared(undefined); setNotice("The signed payload was saved, but script verification did not finish. Nothing was broadcast."); }
      } else if (cause instanceof CodeBroadcastStatusUnknownError) {
        const receipt = makePendingCodeDeployment(prepared, cause.txHash);
        remember(receipt); if (mounted.current) { setPrepared(undefined); setNotice("Submission status is unknown. Check the saved transaction before requesting another signature."); }
      }
      if (mounted.current) setError(message(cause));
    }
    finally { busy.current = false; if (mounted.current) setPhase("idle"); }
  }

  function download(manifest: ConfirmedCodeManifest) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `ckboost-testnet-${manifest.contract}-${manifest.transactionHash.slice(2, 10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadDiagnostic(snapshot: SignedCodeDeploymentDiagnostic) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `ckboost-testnet-${snapshot.contract}-signed-diagnostic-${snapshot.transactionHash.slice(2, 10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const disabled = phase !== "idle";
  return <main className={styles.main}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LOCAL DEPLOYMENT TOOL · TESTNET ONLY</span><h1>Deploy new contract code cells</h1><p>Connected-wallet signing. No private keys are requested or stored.</p></div>
      <RevampButton variant="secondary" onClick={() => open()} disabled={disabled}>{signer ? "Open connected wallet" : "Connect wallet"}</RevampButton>
    </header>
    <div className={styles.notice}><strong>Real Testnet transactions and substantial capacity.</strong> Each preview shows the selected code cell’s exact occupied capacity and fee. The additional independent UserType occupies 361,384 tCKB with your deployment wallet. Capacity stays in the code cell controlled by that wallet. Previously confirmed code deployments remain protected from duplication.</div>
    <section className={styles.panel} aria-label="Connected wallet">
      <h2>1. Verify the wallet and network</h2>
      <p><span className={styles.badge}>CKB Testnet</span> The client must use the public testnet.ckb.dev or testnet.ckbapp.dev network.</p>
      {wallet ? <dl className={styles.facts}><dt>Receiving lock / owner</dt><dd className={styles.code}>{wallet.address}</dd><dt>Wallet type</dt><dd>{connectedWallet?.name ? `${connectedWallet.name}${signer?.type ? ` · ${signer.type}` : ""}` : isCurrentTestnetJoyId ? "JoyID Passkey · known Testnet lock" : signer?.type === ccc.SignerType.EVM ? "EVM wallet · provider brand not reported" : "CKB wallet · provider brand not reported"}</dd><dt>Deployment funding address</dt><dd>{wallet.address === TESTNET_FUNDING_RECIPIENT_ADDRESS ? "Matches your specified deployment funding address" : "Does not match your specified deployment funding address"}</dd><dt>Wallet lock hash</dt><dd className={styles.code}>{wallet.lock.hash()}</dd><dt>Lock args length</dt><dd>{ccc.bytesFrom(wallet.lock.args).length} bytes</dd></dl> : <p>{walletError ? "The connected wallet check failed. Retry it below." : signer ? "Checking the connected Testnet wallet…" : "Connect a wallet to calculate exact code cell capacity."}</p>}
      {walletError && <div role="alert" className={styles.error}>{walletError}<div className={styles.actions}><RevampButton variant="secondary" disabled={disabled} onClick={() => setWalletAttempt(value => value + 1)}>Retry wallet check</RevampButton></div></div>}
      {hasUnsupportedDeployment && <div id="joyid-deployment-compatibility" className={styles.notice} role="note" aria-label="JoyID deployment size limit">
        <strong>This JoyID wallet cannot deploy these reviewed code cells.</strong>
        <p>The current Testnet JoyID lock used by this wallet has a verified 128 KiB ({TESTNET_JOYID_RAW_LIMIT.toLocaleString("en-US")}-byte) raw-transaction limit for this deployment path. The Protocol lock binary alone is {TESTNET_CODE_RELEASES["protocol-lock"].byteLength.toLocaleString("en-US")} bytes; Campaign type is {TESTNET_CODE_RELEASES["campaign-type"].byteLength.toLocaleString("en-US")} bytes, before transaction overhead. Preparation and deployment are disabled here to avoid another rejected wallet request.</p>
        <p>You can keep using this JoyID wallet for compatible, smaller CKBoost app transactions. Code deployment requires a compatible funding wallet that supports these transaction sizes. Use the wallet control above when you choose to connect one; saved receipts and signed diagnostics remain available below.</p>
      </div>}
    </section>
    <TestnetFundingTransferWorkspace />
    <section className={styles.panel}>
      <h2>2. Select the reviewed release binaries</h2>
      <p className={styles.muted}>Only the pinned release candidates below are accepted. ELF architecture, exact byte size, and CKB data hash must all match. Loading performs no wallet action. Use the additional Independent User type card to create a new identity exclusively for this test.</p>
      <div className={styles.grid}>{IDS.map(id => {
        const release = TESTNET_CODE_RELEASES[id], upload = uploads[id], reasons = preparationBlockers(id);
        const reasonsId = `prepare-${id}-reasons`;
        return <article key={id} className={`${styles.panel} ${prepared?.id === id ? styles.ready : ""}`}>
          <h3>{release.name}</h3><p className={styles.code}>{release.fileName}</p>
          <dl className={styles.facts}><dt>Reviewed size</dt><dd>{release.byteLength.toLocaleString("en-US")} bytes</dd><dt>CKB data hash</dt><dd className={styles.code}>{release.dataHash}</dd><dt>New cell capacity</dt><dd>{wallet ? <strong>{amount(getTestnetCodeCapacity(release.byteLength, wallet.lock))}</strong> : "Connect wallet to calculate"}</dd></dl>
          <RevampButton variant="secondary" disabled={disabled} aria-label={`Load reviewed release · ${release.name}`} onClick={() => void loadReviewedRelease(id)}>加载已审核合约 / Load reviewed release</RevampButton>
          <p className={styles.muted}>Loads this pinned binary from the local setup service only when clicked. Then review Verified release and click Prepare. No wallet signature is requested by loading.</p>
          <label className={styles.upload}>或手动选择文件 / Or select a reviewed file manually<input type="file" aria-label={`${release.name} release binary`} disabled={disabled} onChange={event => void chooseFile(id, event.target.files?.[0])} /></label>
          {upload?.reading && <p role="status">Validating the local file…</p>}
          {upload?.bytes && <p className={styles.success}>Verified release: {upload.fileName}</p>}
          {upload?.bytes && upload.source === "local-service" && <p className={styles.success}>已加载已审核发布文件，无需再选择文件 / Reviewed release loaded; no manual file selection needed: {upload.fileName}</p>}
          {upload?.error && <p role="alert" className={styles.error}>{upload.error}</p>}
          <div id={reasonsId} role="status" aria-label={`${release.name} preparation status`} aria-live="polite">
            <p className={reasons.length ? styles.muted : styles.success}>{reasons.length ? "Preparation is blocked for these reasons:" : "Ready to prepare. The selected release is verified. Previously rejected transactions do not block preparation."}</p>
            {reasons.length > 0 && <ul className={styles.list}>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
          </div>
          <RevampButton variant="secondary" disabled={reasons.length > 0} aria-describedby={reasonsId} onClick={() => void prepare(id)}>Prepare {release.name.toLowerCase()} transaction</RevampButton>
        </article>;
      })}</div>
    </section>
    <section className={styles.panel} aria-label="Deployment transaction review">
      <h2>3. Review, then deploy explicitly</h2>
      <div className={styles.state} role="status" aria-live="polite">{phase === "preparing" ? "Reading live capacity cells and calculating the exact network fee…" : notice ?? "Preparation only reads the chain. Deploy requests a wallet signature, saves the signed public diagnostic, and runs read-only script verification before submission."}</div>
      {!prepared && phase === "idle" && <div className={styles.notice}>
        <strong>No transaction is prepared.</strong>
        {hasUnsupportedDeployment ? <p>These deployments need a compatible funding wallet before preparation. You can still check saved receipts in Step 4 and download existing signed diagnostics below.</p> : <p>First check any saved transaction in Step 4 below. Then select the matching release binary in Step 2 and click Prepare. The Deploy new code cell button appears here once preparation succeeds.</p>}
        <p className={styles.muted}>Refreshing clears selected files and unsigned prepared transactions. Previously saved public receipts and signed transaction diagnostics are restored below in this browser.</p>
      </div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {prepared && <>
        <dl className={styles.facts}><dt>Contract</dt><dd>{TESTNET_CODE_RELEASES[prepared.id].name}</dd><dt>New code cell capacity</dt><dd className={styles.amount}>{amount(prepared.capacity)}</dd><dt>Estimated network fee</dt><dd>{amount(prepared.fee)} ({prepared.fee.toString()} shannons)</dd><dt>Capacity + fee</dt><dd><strong>{amount(prepared.capacity + prepared.fee)}</strong></dd><dt>Receiving wallet</dt><dd className={styles.code}>{prepared.walletAddress}</dd><dt>New Type ID args</dt><dd className={styles.code}>{prepared.typeScript.args}</dd><dt>New code hash (type)</dt><dd className={styles.code}>{prepared.typeHash}</dd><dt>CKB data hash</dt><dd className={styles.code}>{prepared.dataHash}</dd></dl>
        <p className={styles.muted}>All inputs are live, empty, untyped capacity cells belonging to this wallet. Output 0 is the new code cell; any other output is wallet change. This does not activate Organizer authorization in the app.</p>
        <RevampButton disabled={disabled || !wallet || Boolean(blockingReceipt(prepared.id)) || unsupportedDeployment(prepared.id)} aria-describedby={unsupportedDeployment(prepared.id) ? "joyid-deployment-compatibility" : undefined} onClick={() => void deploy()}>Deploy new code cell · {TESTNET_CODE_RELEASES[prepared.id].name}</RevampButton>
      </>}
    </section>
    {receipts.length > 0 && <section className={styles.panel} aria-label="Deployment receipts"><h2>4. Confirm and export public manifests</h2><p className={styles.muted}>Public transaction receipts are saved in this browser. After a refresh, check the saved transaction instead of deploying the same binary again. Only a committed, matching live code cell enables manifest export.</p>
      {receipts.map(receipt => <article key={receipt.txHash} className={styles.receipt}><h3>{TESTNET_CODE_RELEASES[receipt.id].name}</h3><p className={styles.code}><a href={`https://pudge.explorer.nervos.org/transaction/${receipt.txHash}`} target="_blank" rel="noreferrer">{receipt.txHash}</a></p><p className={styles.code}>Owner: {receiptOwner(receipt)}</p><p className={styles.muted}>{wallet ? wallet.lock.eq(ccc.Script.from(receipt.walletLock)) ? "Owner is the current connected wallet." : "Owner is a previous wallet, different from the current connected wallet." : "Saved owner wallet. Connect a wallet to compare ownership; status can be checked without it."} {chainStates[receipt.txHash]?.status === "rejected" ? "This rejected record does not block preparation." : confirmed[receipt.txHash] ? "This confirmed deployment remains protected from duplication." : "Unverified, unknown, or pending records still need checking, even when their owner is a previous wallet."}</p>
        {confirmed[receipt.txHash] ? <><p className={styles.success}>Committed on Testnet. Live output, owner lock, Type ID, capacity, and binary data hash verified.</p><RevampButton variant="secondary" onClick={() => download(confirmed[receipt.txHash])}>Export confirmed code manifest</RevampButton><details><summary>View public manifest</summary><pre className={styles.raw}>{JSON.stringify(confirmed[receipt.txHash], null, 2)}</pre></details></> : <><p role="status" className={chainStates[receipt.txHash]?.status === "rejected" ? styles.error : undefined}>{checking === receipt.txHash ? "Checking the saved transaction through public Testnet HTTPS…" : chainStates[receipt.txHash]?.message ?? "Transaction status has not been verified in this session."}</p>{confirmationErrors[receipt.txHash] && <p role="alert" className={styles.error}>{confirmationErrors[receipt.txHash]}</p>}<RevampButton variant="secondary" disabled={disabled || Boolean(checking)} onClick={() => void confirm(receipt)}>Check confirmation · no signing</RevampButton></>}
      </article>)}</section>}
    {diagnostics.length > 0 && <section className={styles.panel} aria-label="Signed transaction diagnostics"><h2>Signed transaction diagnostics</h2><p className={styles.muted}>These files contain the signed Testnet transaction bytes, inputs, dependencies and witnesses for offline inspection. They contain no wallet private key. Downloading never signs or broadcasts. A diagnostic is not a deployment confirmation.</p>{diagnostics.map(snapshot => <article className={styles.receipt} key={snapshot.transactionHash}><h3>{TESTNET_CODE_RELEASES[snapshot.contract].name}</h3><p className={styles.code}>{snapshot.transactionHash}</p><RevampButton variant="secondary" onClick={() => downloadDiagnostic(snapshot)}>Download signed transaction diagnostic</RevampButton></article>)}</section>}
    <TestnetProtocolSetupWorkspace />
    <section className={styles.panel}><h2>What remains before an isolated protocol test</h2><ol className={styles.list}>
      <li>Use Step 5 to prepare and create a fresh protocol state with the specified deployment wallet as its sole admin. Its Organizer and approved campaign lists start empty.</li>
      <li>Confirm the new protocol transaction and export its public manifest. A successful signature alone does not confirm creation or activate the protocol in the app.</li>
      <li>Start the separate test app with the confirmed protocol manifest, both new code identities, and verified shared code dependencies. Its configuration must reach both the frontend and Netlify functions.</li>
      <li>Grant test Organizer membership, then exercise campaign creation, editing, participation, and review. Authorized admins, campaign Organizers and assigned Reviewers sign directly. Only the optional legacy proxy route needs a separately configured signing service.</li>
    </ol><p><Link href="/revamp" prefetch={false}>Return to the new homepage</Link></p></section>
  </main>;
}
