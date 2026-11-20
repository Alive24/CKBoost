"use client";

import type { useContributorSubmit } from "@/lib/revamp/contributor-hooks";
import type { CSSProperties } from "react";
import { RevampButton } from "./ui";
import { usePendingTransactions } from "@/lib/providers/pending-transaction-provider";
import { ContributorCopyButton } from "./contributor-evidence";
import styles from "./contributor.module.css";

export function ContributorTransactionDock({submission}:{submission:ReturnType<typeof useContributorSubmit>}) {
  const {explorerBaseUrl}=usePendingTransactions();
  const tx=submission.transaction;
  if (!tx) return null;
  const progress=tx.stage==="confirmed" ? 4 : tx.txHash ? 3 : tx.stage==="broadcasting" ? 2 : tx.walletStarted ? 1 : 0;
  const labels=["Upload and verify Nostr content","Sign in your wallet","Submit transaction to CKB","Confirm on CKB"];
  const subtitle=tx.stage==="uploading" ? "Uploading quest response…" : tx.stage==="signing" ? "Waiting for wallet signature" : tx.stage==="broadcasting" ? "Broadcasting transaction…" : tx.stage==="submitted" ? "Waiting for CKB confirmation" : tx.stage==="confirmed" ? "Quest submitted · Pending review" : "Submission needs attention.";
  return <aside className={`${styles.dock} ${tx.stage==="confirmed"?styles.dockConfirmed:""}`} aria-label={`Quest #${tx.questId} submission progress`} aria-live="polite">
    <div className={styles.dockHeader}>
      <div className={styles.progressWheel} aria-label={`${progress} of 4 steps complete`}>{[1,2,3,4].map(step=><i key={step} data-step={step} data-complete={step<=progress} data-active={step===progress+1 && tx.stage!=="error"} style={{"--segment":`url('/assets/revamp/creation-step${step}.svg')`} as CSSProperties}/>)}<span>{progress} / 4</span></div>
      <div className={styles.dockHeading}><h2>Quest submission</h2><p className={styles.dockSummary}>{subtitle}</p></div><div className={styles.dockControls}>
      {tx.stage==="uploading" && <button onClick={submission.cancel}>Cancel</button>}
      {tx.stage!=="confirmed" && <button onClick={submission.minimize} aria-label={tx.minimized ? "Expand submission progress" : "Minimize submission progress"}>{tx.minimized ? "+" : <img src="/assets/revamp/contributor-minimize.svg" alt="" width="16" height="16"/>}</button>}
      {(tx.stage==="confirmed" || tx.stage==="error") && <button onClick={submission.dismiss} aria-label="Close submission progress"><img src="/assets/revamp/contributor-close.svg" alt="" width="16" height="16"/></button>}
    </div></div>
    {!tx.minimized && <div className={styles.dockBody}>{tx.stage!=="confirmed" && <ol className={styles.steps}>{labels.map((label,index)=>{
      const done=index<progress, active=!done && tx.stage!=="error" && tx.stage!=="confirmed" && index===progress;
      return <li key={label} className={`${styles.step} ${done ? styles.stepDone : active ? styles.stepActive : ""}`}><span className={styles.stepIndicator}>{done ? <img src="/assets/revamp/contributor-check.svg" alt="" width="12" height="12"/> : active ? <img className={styles.spinning} src="/assets/revamp/contributor-spinner.svg" alt="" width="16" height="16"/> : null}</span><span className={styles.stepLabel}>{label}</span><span className={styles.stepState}>{done ? "Done" : active ? "In progress" : "Queued"}</span></li>;
    })}</ol>}{tx.stage==="confirmed" && tx.neventId && <div className={styles.reference}><strong>Nostr event IDs</strong><span>Quest response</span><div className={styles.referenceRow}><code className={styles.hash} title={tx.neventId}>{tx.neventId}</code><ContributorCopyButton value={tx.neventId} label="Copy event ID"/><a href={`https://njump.me/${encodeURIComponent(tx.neventId)}`} target="_blank" rel="noopener noreferrer">View on Nostr</a></div></div>}{(tx.stage==="confirmed" || tx.stage==="error") && tx.txHash && <div className={`${styles.reference} ${styles.referenceTransaction}`}><strong>CKB transaction ID</strong><div className={styles.referenceRow}><code className={styles.hash} title={tx.txHash}>{tx.txHash}</code><ContributorCopyButton value={tx.txHash} label="Copy transaction ID"/><a href={`${explorerBaseUrl}/transaction/${tx.txHash}`} target="_blank" rel="noopener noreferrer">View on Explorer</a></div></div>}{tx.error && <p className={styles.error} role="alert">{tx.error}</p>}{tx.stage==="error" && tx.txHash && <RevampButton variant="secondary" size="small" onClick={()=>void submission.retry()}>Retry confirmation</RevampButton>}</div>}
  </aside>;
}
