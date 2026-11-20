"use client";

import { useId, useState } from "react";
import { RevampTag } from "./ui";
import styles from "./contributor.module.css";

export function ContributorCopyButton({value, label}: {value: string; label: string}) {
  const [result, setResult] = useState<string | null>(null);
  return <span className={styles.copyControl}>
    <button type="button" className={styles.copyButton} aria-label={label} title={label}
      onClick={() => void navigator.clipboard.writeText(value).then(() => setResult("Copied.")).catch(() => setResult("Unable to copy. Select the identifier."))}>
      <img src="/assets/revamp/contributor-copy.svg" alt="" width="16" height="16" />
    </button>
    {result && <span className={styles.srOnly} role="status">{result}</span>}
  </span>;
}

/** The parent passes the actual nevent reference only after its evidence read.
 * The success badge refers to the existing verified event fetch, not a new
 * promise that arbitrary relays retained the event or a transaction confirmed.
 */
export function ContributorEvidencePanel({reference, verified}: {reference: string; verified: boolean}) {
  const id = useId();
  return <section className={styles.evidencePanel} aria-label="Nostr evidence">
    <div className={styles.evidenceHeading}><strong>Nostr evidence</strong>{verified && <RevampTag pill tone="green">Storage verified</RevampTag>}</div>
    <div className={styles.evidenceReference}>
      <label className={styles.label} htmlFor={id}>Event ID</label>
      <div className={styles.evidenceRow}>
        <input id={id} className={styles.evidenceId} readOnly value={reference} />
        <ContributorCopyButton value={reference} label="Copy event ID" />
        <details className={styles.evidenceExplorer}>
          <summary><span>View on njump.me</span><img src="/assets/revamp/caret-down.svg" alt="" width="24" height="24"/></summary>
          <div><a href={`https://njump.me/${encodeURIComponent(reference)}`} target="_blank" rel="noopener noreferrer">Open on njump.me ↗</a></div>
        </details>
      </div>
    </div>
  </section>;
}
