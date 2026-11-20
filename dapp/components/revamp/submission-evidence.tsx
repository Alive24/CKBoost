"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildQuestResponseEntries, type ResolvedSubmissionEvent } from "@/lib/utils/submission-export";
import { decodeInlineEvidenceFile, type InlineEvidenceFile } from "@/lib/revamp/inline-evidence";
import { RevampButton, RevampTag } from "./ui";
import styles from "./submission-evidence.module.css";

export function safeEvidenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function InlineEvidenceDownload({file}: {file: InlineEvidenceFile}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([file.bytes], {type: file.mimeType}));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <div className={styles.answer}>
    {url ? <a href={url} download={file.name}>{file.name} · Download file</a> : <span>{file.name}</span>}
    {url && file.previewable && <img className={styles.image} src={url} alt={file.name} loading="lazy" />}
  </div>;
}

/** Evidence is user-authored. Render React text and validated URLs; never
 * interpret its HTML or pass it to dangerouslySetInnerHTML. */
export function SafeEvidenceValue({value, type = ""}: {value: string; type?: string}) {
  const text = value.trim();
  const inlineFile = useMemo(() => text.startsWith("{") ? decodeInlineEvidenceFile(text) : null, [text]);
  if (!text) return <span className={styles.answer}>-</span>;
  if (inlineFile) return <InlineEvidenceDownload file={inlineFile} />;
  let url = safeEvidenceUrl(text);
  let label = text;
  let fileType = type;
  if (!url && text.startsWith("{")) {
    try {
      const file = JSON.parse(text) as Record<string, unknown>;
      const source = file.url ?? file.src;
      if (typeof source === "string") url = safeEvidenceUrl(source);
      if (url) {
        label = typeof file.name === "string" ? file.name : typeof file.filename === "string" ? file.filename : url;
        fileType = typeof file.type === "string" ? file.type : type;
      }
    } catch { /* A non-file JSON response remains escaped text. */ }
  }
  if (url) {
    const isImage = /image/i.test(fileType) || /\.(?:png|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(url);
    return <div className={styles.answer}>
      <a href={url} target="_blank" rel="noopener noreferrer">{label}</a>
      {isImage && <a href={url} target="_blank" rel="noopener noreferrer"><img className={styles.image} src={url} alt="Submitted evidence" loading="lazy" /></a>}
    </div>;
  }
  return <div className={`${styles.answer} ${/text|textarea/i.test(type) ? styles.longAnswer : ""}`}>{text}</div>;
}

export function SubmissionResponseFields({quest, content, heading, className}: {
  quest?: Parameters<typeof buildQuestResponseEntries>[0];
  content: string;
  heading?: ReactNode;
  className?: string;
}) {
  const entries = buildQuestResponseEntries(quest, content);
  return <section className={`${styles.card} ${className ?? ""}`} aria-label="Submitted responses">
    {heading}
    {entries.length ? entries.map((entry, index) => <div className={styles.field} key={`${index}:${entry.title}`}>
      <h4>{entry.title}</h4>
      <SafeEvidenceValue value={entry.response} type={entry.type} />
    </div>) : <p className={styles.muted}>No response content is available.</p>}
  </section>;
}

export function SubmissionNostrEvidence({events, loading = false, error, onRetry}: {
  events: readonly ResolvedSubmissionEvent[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const failed = events.some(event => event.error);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyReference = async (reference: string) => {
    try {await navigator.clipboard.writeText(reference); setCopyStatus("Event reference copied.");}
    catch {setCopyStatus("Unable to copy. Select the event reference to copy it.");}
  };
  return <section className={styles.card} aria-label="Nostr evidence">
    <div className={styles.row}><h3>Nostr evidence</h3><RevampTag tone={error || failed ? "amber" : events.length ? "green" : "neutral"} pill>{loading ? "Loading" : error || failed ? "Unavailable" : events.length ? "Loaded" : "Direct response"}</RevampTag></div>
    {loading && <p className={styles.muted} role="status">Loading submitted evidence…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && !events.length && !error && <p className={styles.muted}>This response has no Nostr event reference.</p>}
    {events.map(event => <div className={styles.event} key={event.neventId}>
      <span className={styles.muted}>Event reference</span>
      <div className={styles.eventControls}>
        <code className={styles.reference} title={event.neventId}>{event.neventId}</code>
        <RevampButton variant="secondary" size="icon" className={styles.copyButton} aria-label="Copy event reference" onClick={() => void copyReference(event.neventId)}><span aria-hidden="true" className={styles.copyIcon} /></RevampButton>
        {/^nevent1[0-9a-z]+$/i.test(event.neventId) && <RevampButton asChild variant="secondary" className={styles.explorerLink}><a href={`https://njump.me/${encodeURIComponent(event.neventId)}`} target="_blank" rel="noopener noreferrer">View on njump.me ↗</a></RevampButton>}
      </div>
      {event.pubkey && <><span className={styles.muted}>Author</span><code>{event.pubkey}</code></>}
      {typeof event.createdAt === "number" && Number.isFinite(new Date(event.createdAt * 1000).getTime()) && <p className={styles.muted}>{new Date(event.createdAt * 1000).toISOString()}</p>}
      {event.error && <p className={styles.error}>{event.error}</p>}
    </div>)}
    {copyStatus && <p role="status" className={styles.muted}>{copyStatus}</p>}
    {(error || failed) && onRetry && <RevampButton variant="secondary" size="small" onClick={onRetry}>Retry evidence</RevampButton>}
  </section>;
}
