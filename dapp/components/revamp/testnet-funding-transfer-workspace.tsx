"use client";

import { useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { RevampButton } from "./ui";
import { assertTestnetDeploymentClient, deploymentReadDeadline } from "@/lib/revamp/testnet-code-deployment";
import {
  TESTNET_FUNDING_SOURCE_LOCK_HASH, TESTNET_FUNDING_RECIPIENT_ADDRESS, TESTNET_FUNDING_AMOUNT,
  prepareTestnetFundingTransfer, signAndBroadcastTestnetFundingTransfer, makePendingFundingTransfer,
  parsePendingFundingTransfers, probeTestnetFundingTransfer,
  parseSignedFundingTransferDiagnostics,
  CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError,
  type PreparedTestnetFundingTransfer, type PendingFundingTransfer, type SignedFundingTransferDiagnostic,
} from "@/lib/revamp/testnet-funding-transfer";
import styles from "./testnet-setup-workspace.module.css";

const RECEIPTS_KEY = "ckboost-testnet-funding-transfer-receipts-v1";
const DIAGNOSTICS_KEY = "ckboost-testnet-funding-transfer-signed-diagnostics-v1";
type CheckState = { status: "confirmed" | "pending" | "rejected" | "unknown"; message: string };
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The transfer could not be completed. Check the saved receipt before trying again.";
function amount(value: bigint) {
  const [whole, fraction] = ccc.fixedPointToString(value).split(".");
  return `${BigInt(whole).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} tCKB`;
}

/** A fixed, explicitly authorized move between two wallets. No faucet, arbitrary recipient, or automatic wallet action. */
export function TestnetFundingTransferWorkspace() {
  const signer = ccc.useSigner();
  const { client } = ccc.useCcc();
  const [wallet, setWallet] = useState<{ address: string; lockHash: string }>();
  const [walletError, setWalletError] = useState<string>();
  const [walletAttempt, setWalletAttempt] = useState(0);
  const [prepared, setPrepared] = useState<PreparedTestnetFundingTransfer>();
  const [phase, setPhase] = useState<"idle" | "preparing" | "wallet">("idle");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [receipts, setReceipts] = useState<PendingFundingTransfer[]>([]);
  const [states, setStates] = useState<Record<string, CheckState>>({});
  const [checking, setChecking] = useState<string>();
  const [diagnostics, setDiagnostics] = useState<SignedFundingTransferDiagnostic[]>([]);
  const receiptsRef = useRef<PendingFundingTransfer[]>([]);
  const statesRef = useRef<Record<string, CheckState>>({});
  const mounted = useRef(true), busy = useRef(false), checkingRef = useRef(false);
  const operation = useRef(0), checkOperation = useRef(0);
  const scope = useRef({ signer, client });
  scope.current = { signer, client };
  const matchesSource = wallet?.lockHash.toLowerCase() === TESTNET_FUNDING_SOURCE_LOCK_HASH.toLowerCase();
  const blockedReceipt = () => receiptsRef.current.find(receipt => statesRef.current[receipt.txHash]?.status !== "rejected");

  function synchronizeReceipts() {
    try {
      const next = parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY));
      receiptsRef.current = next;
      if (mounted.current) setReceipts(next);
    } catch { /* A later required write will stop submission if public storage is unavailable. */ }
  }

  useEffect(() => {
    mounted.current = true;
    try {
      receiptsRef.current = parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY));
      setReceipts(receiptsRef.current);
    } catch { /* No restored receipt is claimed when browser storage is unavailable. */ }
    try { setDiagnostics(parseSignedFundingTransferDiagnostics(localStorage.getItem(DIAGNOSTICS_KEY))); } catch { /* No diagnostic is claimed if storage cannot be read. */ }
    const onStorage = (event: StorageEvent) => { if (event.key === RECEIPTS_KEY) synchronizeReceipts(); };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("storage", onStorage); mounted.current = false; operation.current++; checkOperation.current++; };
  }, []);

  useEffect(() => {
    operation.current++; setPrepared(undefined); setWallet(undefined); setWalletError(undefined); setError(undefined);
    let active = true;
    if (!signer) return;
    void (async () => {
      try {
        assertTestnetDeploymentClient(client); assertTestnetDeploymentClient(signer.client);
        const address = await deploymentReadDeadline(signer.getRecommendedAddressObj(), 12000);
        if (active && scope.current.signer === signer && scope.current.client === client) setWallet({ address: address.toString(), lockHash: address.script.hash() });
      } catch (cause) { if (active) setWalletError(message(cause)); }
    })();
    return () => { active = false; };
  }, [signer, client, walletAttempt]);

  function updateState(txHash: string, state: CheckState) {
    statesRef.current = { ...statesRef.current, [txHash]: state };
    if (mounted.current) setStates(statesRef.current);
  }

  /** Called before send: inability to retain this public receipt must prevent submission. */
  function remember(receipt: PendingFundingTransfer) {
    let existing = receiptsRef.current;
    try { existing = [...parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY)), ...existing]; } catch { /* The required write below still decides whether submission is allowed. */ }
    if (existing.some(item => item.txHash !== receipt.txHash && statesRef.current[item.txHash]?.status !== "rejected")) throw new Error("Another saved test-fund transfer must be checked first. This transfer was stopped before sending.");
    const unique = new Map(existing.filter(item => item.txHash !== receipt.txHash).map(item => [item.txHash, item]));
    const next = parsePendingFundingTransfers(JSON.stringify([receipt, ...unique.values()].slice(0, 16)));
    if (!next.some(item => item.txHash === receipt.txHash)) throw new Error("The public transfer receipt is invalid. Nothing was submitted.");
    try { localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next)); }
    catch { throw new Error("The browser could not save the public transfer receipt. Submission was stopped before sending. Free browser storage before preparing again."); }
    receiptsRef.current = next;
    if (mounted.current) setReceipts(next);
  }

  function rememberDiagnostic(snapshot: SignedFundingTransferDiagnostic) {
    const next = parseSignedFundingTransferDiagnostics(JSON.stringify([snapshot]));
    if (!next.some(item => item.transactionHash === snapshot.transactionHash)) throw new Error("The signed public transfer could not be verified for diagnostic export. Nothing was broadcast.");
    try { localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next)); } catch { /* The current session still offers the public diagnostic for download. */ }
    if (mounted.current) {
      setDiagnostics(next);
      setNotice("Transfer signature captured. Running read-only Testnet script verification before submission…");
    }
  }

  function downloadDiagnostic(snapshot: SignedFundingTransferDiagnostic) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `ckboost-testnet-funding-transfer-signed-diagnostic-${snapshot.transactionHash.slice(2, 10)}.json`;
    link.click(); URL.revokeObjectURL(url);
  }

  async function prepare() {
    if (!signer || !matchesSource || busy.current) return;
    synchronizeReceipts();
    if (blockedReceipt()) { setError("Check the saved transfer first. A pending, unknown, or already committed transfer must not be repeated."); return; }
    busy.current = true; const version = ++operation.current;
    const sourceSigner = signer, sourceClient = client; let active = true;
    const isCurrent = () => active && mounted.current && operation.current === version && scope.current.signer === sourceSigner && scope.current.client === sourceClient;
    setPhase("preparing"); setPrepared(undefined); setError(undefined); setNotice(undefined);
    try {
      const result = await deploymentReadDeadline(prepareTestnetFundingTransfer(signer, isCurrent), 30000);
      if (isCurrent()) { setPrepared(result); setNotice("Unsigned transfer prepared. Review the fixed recipient, amount and network fee before requesting a wallet signature."); }
    } catch (cause) { if (isCurrent()) setError(message(cause)); }
    finally { active = false; busy.current = false; if (mounted.current) setPhase("idle"); }
  }

  async function check(receipt: PendingFundingTransfer) {
    if (checkingRef.current) return;
    checkingRef.current = true; const version = ++checkOperation.current;
    const isCurrent = () => mounted.current && checkOperation.current === version;
    setChecking(receipt.txHash);
    try {
      const result = await probeTestnetFundingTransfer(receipt, { isCurrent });
      if (!isCurrent()) return;
      if (result.status === "confirmed") updateState(receipt.txHash, { status: "confirmed", message: `Committed: ${amount(TESTNET_FUNDING_AMOUNT)} was transferred to the fixed MetaMask address. Do not repeat this transfer. Use Open connected wallet above to return to MetaMask for code deployment.` });
      else updateState(receipt.txHash, { status: result.status, message: result.status === "rejected" ? `The node rejected this transfer. ${result.reason}` : result.message });
    } catch (cause) {
      if (isCurrent()) updateState(receipt.txHash, { status: "unknown", message: `${message(cause)} The transfer status remains unknown; do not resend.` });
    } finally { checkingRef.current = false; if (isCurrent()) setChecking(undefined); }
  }

  async function sign() {
    if (!signer || !prepared || !matchesSource || busy.current) return;
    synchronizeReceipts();
    if (blockedReceipt()) { setError("Check the existing transfer receipt before requesting another signature."); return; }
    busy.current = true; const version = ++operation.current;
    const sourceSigner = signer, sourceClient = client;
    const isCurrent = () => mounted.current && operation.current === version && scope.current.signer === sourceSigner && scope.current.client === sourceClient;
    let captured: PendingFundingTransfer | undefined;
    setPhase("wallet"); setError(undefined); setNotice("Review this fixed test-fund transfer in your JoyID wallet. No automatic signing or resend will occur.");
    try {
      const txHash = await signAndBroadcastTestnetFundingTransfer(signer, prepared, isCurrent, {
        onSignedDiagnostic: rememberDiagnostic,
        onBeforeBroadcast: receipt => { remember(receipt); captured = receipt; },
      });
      const receipt = captured ?? makePendingFundingTransfer(prepared, txHash);
      if (!captured) remember(receipt);
      if (!isCurrent()) return;
      setPrepared(undefined); setNotice("Transfer submitted to Testnet. Checking its current status once; the saved receipt remains available for later checks.");
      await check(receipt);
    } catch (cause) {
      if (cause instanceof CodeDeploymentRejectedError && cause.stage === "broadcast") {
        const receipt = captured ?? makePendingFundingTransfer(prepared, cause.txHash);
        if (!captured) remember(receipt);
        updateState(receipt.txHash, { status: "rejected", message: cause.message });
      } else if (cause instanceof CodeBroadcastStatusUnknownError) {
        const receipt = captured ?? makePendingFundingTransfer(prepared, cause.txHash);
        if (!captured) remember(receipt);
        updateState(receipt.txHash, { status: "unknown", message: "Broadcast status is unknown. The saved transaction must be checked before any new transfer; do not resend." });
      } else if (captured) {
        updateState(captured.txHash, { status: "unknown", message: "A signed transfer was ready for submission, but its final status is unknown. Check the saved transaction before trying again." });
      }
      if (isCurrent()) {
        setError(cause instanceof CodeBroadcastStatusUnknownError ? `The test-fund transfer may have been submitted. Check its saved receipt before preparing another transfer. ${cause.message.split(". Check transaction")[0]}.` : message(cause));
        if (cause instanceof CodeDeploymentRejectedError || cause instanceof CodeDeploymentPreflightError) setNotice(cause instanceof CodeDeploymentRejectedError && cause.stage === "broadcast" ? "The node rejected this transfer. Its public receipt is retained; it is not waiting for confirmation." : "Read-only transfer verification failed. Nothing was broadcast. Download the signed public transfer diagnostic below before deciding whether to prepare again.");
        if (captured || cause instanceof CodeDeploymentPreflightError || cause instanceof CodeDeploymentRejectedError) setPrepared(undefined);
      }
    } finally { busy.current = false; if (mounted.current) setPhase("idle"); }
  }

  const disabled = phase !== "idle" || Boolean(checking);
  const blocking = blockedReceipt();
  return <section className={styles.panel} aria-label="Testnet funding transfer">
    <h2>Move existing test funds to the deployment wallet</h2>
    <p>This moves the existing {amount(TESTNET_FUNDING_AMOUNT)} from the authorized JoyID wallet to your fixed MetaMask address. It does not request more faucet funds.</p>
    <dl className={styles.facts}>
      <dt>Fixed recipient</dt><dd className={styles.code}>{TESTNET_FUNDING_RECIPIENT_ADDRESS}</dd>
      <dt>Fixed transfer amount</dt><dd className={styles.amount}>{amount(TESTNET_FUNDING_AMOUNT)}</dd>
      <dt>Authorized source lock hash</dt><dd className={styles.code}>{TESTNET_FUNDING_SOURCE_LOCK_HASH}</dd>
      <dt>Connected wallet</dt><dd className={styles.code}>{wallet?.address ?? (signer ? "Checking connected wallet…" : "No wallet connected")}</dd>
      <dt>Source match</dt><dd>{wallet ? matchesSource ? "Matches the authorized JoyID source" : "Does not match the authorized source" : "Not verified"}</dd>
    </dl>
    {walletError && <p className={styles.error} role="alert">{walletError} <RevampButton variant="secondary" disabled={disabled} onClick={() => setWalletAttempt(value => value + 1)}>Retry transfer source check</RevampButton></p>}
    {!matchesSource && <p className={styles.notice}>Use {signer ? "Open connected wallet" : "Connect wallet"} above to select the funded JoyID wallet for this transfer. After it is committed, return to MetaMask to deploy the code cells. Wallet selection is your action.</p>}
    {matchesSource && <p className={styles.muted}>The fixed destination and amount cannot be changed here. Prepare only reads the chain; a signature is requested only after you review the preview and click the transfer button.</p>}
    {blocking && <p className={styles.notice}>{states[blocking.txHash]?.status === "confirmed" ? "This transfer is already committed. Do not repeat it; return to MetaMask for code deployment." : "A saved transfer must be checked first. Preparation stays blocked while its status is pending, unknown, or not yet checked in this session."}</p>}
    <div className={styles.actions}><RevampButton variant="secondary" disabled={disabled || !matchesSource || Boolean(blocking)} onClick={() => void prepare()}>Prepare unsigned test-fund transfer</RevampButton></div>
    {phase === "preparing" && <p role="status">Reading the authorized source cells and calculating the exact network fee…</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {prepared && <div className={styles.receipt} aria-label="Unsigned transfer preview">
      <h3>Review the unsigned transfer</h3>
      <dl className={styles.facts}>
        <dt>Source wallet</dt><dd className={styles.code}>{prepared.sourceAddress}</dd>
        <dt>Recipient address</dt><dd className={styles.code}>{prepared.recipientAddress}</dd>
        <dt>Recipient capacity</dt><dd>{amount(prepared.amount)}</dd>
        <dt>Estimated network fee</dt><dd>{amount(prepared.fee)} ({prepared.fee.toString()} shannons)</dd>
        <dt>Total source capacity spent</dt><dd><strong>{amount(prepared.amount + prepared.fee)}</strong></dd>
      </dl>
      <RevampButton disabled={disabled || !matchesSource || Boolean(blocking)} onClick={() => void sign()}>Sign and send fixed {amount(TESTNET_FUNDING_AMOUNT)} transfer</RevampButton>
    </div>}
    {receipts.length > 0 && <div className={styles.receipt} aria-label="Saved test-fund transfers">
      <h3>Saved transfer receipts</h3>
      <p className={styles.muted}>These public receipts are separate from contract code receipts. Refreshing clears unsigned preparation; it never causes a transfer to be sent again.</p>
      {receipts.map(receipt => <article className={styles.receipt} key={receipt.txHash}>
        <a className={styles.code} href={`https://pudge.explorer.nervos.org/transaction/${receipt.txHash}`} target="_blank" rel="noreferrer">{receipt.txHash}</a>
        <p role="status" className={states[receipt.txHash]?.status === "confirmed" ? styles.success : states[receipt.txHash]?.status === "rejected" ? styles.error : undefined}>{checking === receipt.txHash ? "Checking the transfer once through public Testnet HTTPS…" : states[receipt.txHash]?.message ?? "Status has not been verified in this session. Check this transaction before preparing another transfer."}</p>
        <RevampButton variant="secondary" disabled={disabled || Boolean(checking)} onClick={() => void check(receipt)}>Check transfer status · no signing</RevampButton>
      </article>)}
    </div>}
    {diagnostics.length > 0 && <div className={styles.receipt} aria-label="Signed transfer diagnostics">
      <h3>Signed test-fund transfer diagnostic</h3>
      <p className={styles.muted}>This public file preserves the signed transaction bytes for inspection, including when read-only verification rejects the transfer. It contains no wallet private key. A diagnostic is not a receipt or proof of transfer; downloading never signs or submits.</p>
      {diagnostics.map(snapshot => <article key={snapshot.transactionHash}><p className={styles.code}>{snapshot.transactionHash}</p><RevampButton variant="secondary" onClick={() => downloadDiagnostic(snapshot)}>Download signed transfer diagnostic</RevampButton></article>)}
    </div>}
  </section>;
}
