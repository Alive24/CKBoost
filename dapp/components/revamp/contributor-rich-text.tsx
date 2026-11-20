"use client";

import { createElement, useEffect, useState, type ReactNode } from "react";
import { marked } from "marked";
import { safeEvidenceUrl } from "./submission-evidence";
import styles from "./contributor.module.css";

const tags=new Set(["p","div","span","br","strong","b","em","i","u","s","h1","h2","h3","h4","h5","h6","ul","ol","li","blockquote","pre","code","hr","a","img","table","thead","tbody","tr","th","td","details","summary"]);
const forbidden=new Set(["script","style","iframe","object","embed","form","input","button","svg","math","template"]);
/** Reconstruct a small HTML vocabulary as React nodes. Untrusted attributes,
 * scripts, styles and non-HTTP resources never enter the rendered document. */
export function ContributorRichText({content}:{content:string}) {
  const [parsed,setParsed]=useState<{source:string;nodes:ReactNode}|null>(null);
  useEffect(()=>{
    // Markdown produces HTML, then the same allowlist rebuilds safe React
    // nodes. Raw legacy HTML stays compatible and never bypasses sanitation.
    const html=marked.parse(content.slice(0,2_000_000),{async:false,breaks:true});
    const document=new DOMParser().parseFromString(html,"text/html");
    let budget=10_000;
    function walk(node:Node,key:string):ReactNode {
      if (--budget<0) return null;
      if (node.nodeType===3) return node.textContent;
      if (node.nodeType!==1) return null;
      const element=node as HTMLElement, tag=element.tagName.toLowerCase();
      if (forbidden.has(tag)) return null;
      const children=Array.from(node.childNodes).map((child,index)=>walk(child,`${key}:${index}`));
      if (!tags.has(tag)) return children;
      if (tag==="a") {const href=safeEvidenceUrl(element.getAttribute("href") ?? "");return href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{children}</a> : children;}
      if (tag==="img") {const src=safeEvidenceUrl(element.getAttribute("src") ?? "");return src ? <img key={key} src={src} alt={element.getAttribute("alt") ?? ""} loading="lazy" /> : null;}
      return createElement(tag,{key},...children);
    }
    setParsed({source:content,nodes:Array.from(document.body.childNodes).map((node,index)=>walk(node,String(index)))});
  },[content]);
  return <div className={styles.rich}>{parsed?.source===content ? parsed.nodes : content.replace(/<!--[\s\S]*?-->/g,"").replace(/<[^>]*>/g,"")}</div>;
}
