"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {DEFAULT_NOSTR_RELAYS, useNostr} from "@/lib/providers/nostr-provider";
import {acquireCampaignCover, coverReference} from "./campaign-cover-cache";

const visibleListeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;
function observe(element: Element, update: (visible: boolean) => void) {
  if (typeof IntersectionObserver === "undefined") { update(true); return () => {}; }
  observer ??= new IntersectionObserver(items => {
    for (const item of items) visibleListeners.get(item.target)?.(item.isIntersecting);
  }, {rootMargin: "240px 0px", threshold: 0});
  visibleListeners.set(element, update); observer.observe(element);
  return () => {
    visibleListeners.delete(element); observer?.unobserve(element);
    if (!visibleListeners.size) { observer?.disconnect(); observer = undefined; }
  };
}

/** Only near-viewport images may resolve events or enter the browser decoder. */
export function useRevampCampaignCover(source?: string | null) {
  const {nostr} = useNostr();
  const ref = useRef<HTMLDivElement>(null);
  const reference = useMemo(() => coverReference(source), [source]);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{key: string; src: string | null; loading: boolean} | null>(null);
  useEffect(() => ref.current ? observe(ref.current, next => {
    setVisible(next);
    // An inactive cache entry may be evicted and its Blob URL revoked. Do not
    // briefly reattach that old URL before the returning effect reacquires it.
    if (!next) setResult(null);
  }) : undefined, []);
  useEffect(() => {
    if (!visible || !reference || (!reference.eventId && !reference.source.startsWith("data:")) || (reference.eventId && !nostr)) return;
    let current = true;
    setResult({key: reference.key, src: null, loading: true});
    const request = acquireCampaignCover(reference, nostr, DEFAULT_NOSTR_RELAYS);
    request.promise.then(value => { if (current) setResult({key: reference.key, src: value.src, loading: false}); },
      () => { if (current) setResult({key: reference.key, src: null, loading: false}); });
    return () => { current = false; request.release(); };
  }, [visible, reference, nostr]);
  if (visible && reference && !reference.eventId && !reference.source.startsWith("data:")) {
    return {ref, src: reference.source, isLoading: false};
  }
  const current = visible && reference && result?.key === reference.key ? result : null;
  return {ref, src: current?.src ?? null, isLoading: current?.loading ?? false};
}
