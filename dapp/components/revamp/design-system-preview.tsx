"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RevampAlert, RevampButton, RevampIcon, RevampInput, RevampSelect, RevampSwitch, RevampTag, RevampText, RevampTextarea } from "./ui";
import { useRevampTheme } from "./theme";
import { radii, spacing, tagTones, themeTokens, typography, type TypographyVariant } from "./tokens";
import styles from "./revamp.module.css";

const colorSamples = [
  "background-canvas", "background-surface", "background-raised", "background-subtle",
  "brand-primary", "brand-accent", "brand-text", "brand-subtle", "text-primary", "text-secondary", "text-muted", "border-subtle",
] as const;

function Section({ id, number, title, description, children }: {id: string; number: string; title: string; description: string; children: ReactNode}) {
  return <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
    <div className={styles.sectionHeading}>
      <span className={styles.sectionNumber}>{number}</span>
      <div><RevampText variant="h3" as="h2" id={`${id}-title`}>{title}</RevampText><p className={styles.muted}>{description}</p></div>
    </div>
    {children}
  </section>;
}

export function DesignSystemPreview() {
  const { theme, toggleTheme } = useRevampTheme();
  const [feedback, setFeedback] = useState("Choose a button to try its interaction.");
  const [difficulty, setDifficulty] = useState("all");
  const [enabled, setEnabled] = useState(true);
  const [campaignName, setCampaignName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const nameError = submitted && !campaignName.trim();

  return <>
    <a className={styles.skipLink} href="#design-system-main">Skip to components</a>
    <header className={styles.header}>
      <Link href="/revamp/design-system" className={styles.brand} aria-label="CKBoost design system">
        <span className={styles.wordmark} aria-hidden="true">
          <img src="/assets/revamp/logo-blue.svg" alt="" className={styles.logoBlue} />
          <img src="/assets/revamp/logo-magenta.svg" alt="" className={styles.logoMagenta} />
          <span className={styles.logoInk} />
        </span>
        <span className={styles.brandLabel}>Design system <RevampTag tone="violet" pill>Preview</RevampTag></span>
      </Link>
      <div className={styles.headerActions}>
        <RevampButton asChild variant="secondary"><Link href="/">Current site</Link></RevampButton>
        <RevampButton variant="secondary" size="icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><RevampIcon name={theme === "dark" ? "sun" : "moon"} /></RevampButton>
      </div>
    </header>

    <main id="design-system-main" className={styles.previewMain}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>CKBOOST / FOUNDATIONS</p>
        <h1 className={styles.pixelHeading}>One system. Two modes.</h1>
        <p className={styles.introDescription}>The first building blocks for the next CKBoost. Shared semantic tokens, accessible controls, and Light / Dark themes.</p>
        <div className={styles.row}><RevampTag tone="green" pill>{theme === "dark" ? "Dark" : "Light"} mode</RevampTag><span className={styles.muted}>Isolated preview · The current homepage stays unchanged.</span></div>
      </div>
      <nav aria-label="Design system sections" className={styles.sectionNav}>
        {[['colors','Colors'],['typography','Typography'],['geometry','Spacing & radius'],['buttons','Buttons'],['fields','Form controls'],['tags','Tags'],['feedback','Feedback']].map(([id,label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <Section id="colors" number="01" title="Semantic colors" description="The same roles resolve to different values in each theme.">
        <div className={styles.swatchGrid}>{colorSamples.map(name => <div key={name} className={styles.swatchCard}>
          <div className={styles.swatch} style={{background: `var(--ckb-${name})`}} />
          <div className={styles.swatchDescription}><span>{name.replaceAll('-', ' / ')}</span><code>{themeTokens[theme][name]}</code></div>
        </div>)}</div>
      </Section>

      <Section id="typography" number="02" title="Typography" description="Cabinet Grotesk for the interface. Pixelify Sans for brand moments. JetBrains Mono for technical values.">
        <div className={styles.panel}>{(Object.keys(typography) as TypographyVariant[]).map(variant => <div key={variant} className={styles.typeRow}>
          <div className={styles.typeMeta}><strong>{variant}</strong><code>{typography[variant][0]} / {typography[variant][1]} · {typography[variant][2]}</code></div>
          <RevampText variant={variant}>{variant === 'code' ? '0x3aee953b010d5861 · 128 CKB' : 'Build. Learn. Earn on CKB.'}</RevampText>
        </div>)}</div>
      </Section>

      <Section id="geometry" number="03" title="Spacing & radius" description="A common rhythm, from compact controls to spacious page layouts.">
        <div className={styles.twoColumns}>
          <div className={styles.panel}><RevampText variant="subheader1">Spacing</RevampText><div className={styles.spacingSamples}>{spacing.map(value => <div key={value} className={styles.spacingSample}><code>{value}</code><span style={{width: Math.max(value, 1)}} /></div>)}</div></div>
          <div className={styles.panel}><RevampText variant="subheader1">Corner radius</RevampText><div className={styles.radiusSamples}>{radii.map(value => <div key={value}><span style={{borderRadius: value}} /><code>{value}px</code></div>)}</div></div>
        </div>
      </Section>

      <Section id="buttons" number="04" title="Buttons" description="Primary and secondary actions. Sizes: 32, 40, and 48px.">
        <div className={styles.panel}>
          <div className={styles.row}>{(['primary','secondary'] as const).map(variant => <RevampButton key={variant} variant={variant} onClick={() => setFeedback(`${variant[0].toUpperCase() + variant.slice(1)} action selected.`)}>{variant[0].toUpperCase() + variant.slice(1)}</RevampButton>)}</div>
          <div className={styles.row}>{(['small','default','large'] as const).map((size, index) => <RevampButton key={size} variant="secondary" size={size} onClick={() => setFeedback(`${[32,40,48][index]}px button selected.`)}>{[32,40,48][index]}px button</RevampButton>)}<RevampButton disabled>Disabled</RevampButton><RevampButton loading>Loading</RevampButton></div>
          <p className={styles.interactionFeedback} role="status" aria-live="polite">{feedback}</p>
        </div>
      </Section>

      <Section id="fields" number="05" title="Form controls" description="Try focus, validation, dropdown selection, and disabled or read-only states.">
        <form noValidate className={styles.twoColumns} onSubmit={event => {event.preventDefault(); setSubmitted(true);}}>
          <div className={styles.panel}>
            <label className={styles.field}><span>Campaign name <span className={styles.required}>*</span></span><RevampInput placeholder="Give your campaign a name" value={campaignName} onChange={event => {setCampaignName(event.target.value); setSubmitted(false);}} required aria-invalid={nameError} aria-describedby="campaign-name-help" /><small id="campaign-name-help" className={nameError ? styles.errorText : styles.muted}>{nameError ? 'Enter a campaign name.' : 'A short, clear title helps people find your campaign.'}</small></label>
            <label className={styles.field}><span>Description</span><RevampTextarea placeholder="What will contributors learn or build?" rows={3} /></label>
            <div className={styles.field}><span>Difficulty</span><RevampSelect label="Difficulty" value={difficulty} onValueChange={setDifficulty} options={[{value:'all',label:'All difficulties'},{value:'easy',label:'Easy'},{value:'intermediate',label:'Intermediate'},{value:'hard',label:'Hard'}]} /></div>
            <div className={styles.row}><RevampSwitch id="preview-updates" checked={enabled} onCheckedChange={setEnabled} /><label htmlFor="preview-updates">Campaign updates {enabled ? 'on' : 'off'}</label></div>
            <div className={styles.row}><RevampButton type="submit">Validate example</RevampButton>{submitted && !nameError && <span className={styles.successText} role="status">Example validated. Nothing is published.</span>}</div>
          </div>
          <div className={styles.panel}>
            <label className={styles.field}><span>Small · 32px</span><RevampInput fieldSize="small" placeholder="Compact input" /></label>
            <label className={styles.field}><span>Large · 48px</span><RevampInput fieldSize="large" placeholder="Comfortable input" /></label>
            <label className={styles.field}><span>Read only</span><RevampInput readOnly value="CKBoost / Community" /></label>
            <label className={styles.field}><span>Disabled</span><RevampInput disabled placeholder="Unavailable field" /></label>
            <label className={styles.field}><span>Error</span><RevampInput aria-invalid="true" aria-describedby="preview-error-help" defaultValue="Invalid example" /><small id="preview-error-help" className={styles.errorText}>Please check this value.</small></label>
            <div className={styles.row}><RevampSwitch aria-label="Disabled switch example" disabled /><span className={styles.muted}>Disabled switch</span></div>
          </div>
        </form>
      </Section>

      <Section id="tags" number="06" title="Tags & badges" description="Nine semantic tones, with square tags and outlined status pills.">
        <div className={styles.panel}><div className={styles.row}>{tagTones.map(tone => <RevampTag key={tone} tone={tone}>{tone[0].toUpperCase() + tone.slice(1)}</RevampTag>)}</div><div className={styles.row}><RevampTag tone="rose" pill>Ending soon</RevampTag><RevampTag tone="green" pill>Active</RevampTag><RevampTag tone="cyan" pill>Upcoming</RevampTag><RevampTag pill>Completed</RevampTag></div></div>
      </Section>

      <Section id="feedback" number="07" title="Feedback" description="Functional colors remain distinct in both modes.">
        <div className={styles.twoColumns}><RevampAlert tone="success">Success · Your changes have been saved.</RevampAlert><RevampAlert tone="warning">Warning · Review the details before continuing.</RevampAlert><RevampAlert tone="error">Error · Something needs your attention.</RevampAlert><RevampAlert tone="info">Info · You can explore campaigns before connecting a wallet.</RevampAlert></div>
      </Section>
    </main>
    <footer className={styles.footer}><span>© {new Date().getFullYear()} CKBoost</span><div className={styles.row}><a href="https://www.figma.com/design/nxsPSskHMjrxLYW8AWTf5N/CKBoost-Redesign?node-id=0-1" target="_blank" rel="noreferrer">Figma source ↗</a><Link href="/">Current site</Link></div></footer>
  </>;
}
