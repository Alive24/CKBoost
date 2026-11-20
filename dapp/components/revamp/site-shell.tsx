"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { ccc } from "@ckb-ccc/connector-react";
import { usePendingTransactions } from "@/lib/providers/pending-transaction-provider";
import { useDiscovery } from "@/lib/revamp/discovery-provider";
import { useHeaderAccount, type HeaderAccountScope } from "@/lib/revamp/use-header-account";
import { RevampButton, RevampIcon } from "./ui";
import { useRevampTheme } from "./theme";
import { FigmaIcon } from "./figma-icon";
import styles from "./site-shell.module.css";

const BusinessHeader = dynamic(() => import("./business-header"));

export function RevampSiteHeader() {
  const pathname = usePathname();
  return pathname === "/revamp" ? <DiscoveryHeader /> : <BusinessHeader />;
}

function DiscoveryHeader() {
  const discovery = useDiscovery();
  return <RevampHeaderAccount protocolCell={discovery.protocolCell} protocolLoading={discovery.protocolLoading} protocolError={discovery.protocolError?.message} />;
}

export function RevampHeaderAccount(scope: HeaderAccountScope) {
  const { theme, toggleTheme } = useRevampTheme();
  const { open } = ccc.useCcc();
  const account = useHeaderAccount(scope);
  const { activeCount } = usePendingTransactions();
  const previousPending = useRef(activeCount);
  useEffect(() => {
    if (previousPending.current > 0 && activeCount === 0) account.refresh();
    previousPending.current = activeCount;
  }, [activeCount, account.refresh]);
  const points = account.points?.toLocaleString("en-US") ?? "—";

  return <header className={styles.header}>
    <Link href="/revamp" prefetch={false} className={styles.brand} aria-label="CKBoost home">
      <span className={styles.wordmark} aria-hidden="true">
        <img src="/assets/revamp/logo-blue.svg" alt="" className={styles.blue} />
        <img src="/assets/revamp/logo-magenta.svg" alt="" className={styles.magenta} />
        <span className={styles.ink} />
      </span>
    </Link>
    <nav className={styles.navigation} aria-label="Main navigation">
      <Link href="/revamp" prefetch={false} aria-current="page"><span className={styles.navFlag} aria-hidden="true" />Campaigns</Link>
      <Link href="/leaderboard" prefetch={false}><span className={styles.navTrophy}><FigmaIcon name="trophy" size={18} /></span>Leaderboard</Link>
      <Link href="/tipping" prefetch={false}><FigmaIcon name="udt" size={18} />Tipping</Link>
    </nav>
    <div className={styles.actions}>
      <RevampButton onClick={() => open()} variant={account.isConnected ? "secondary" : "primary"} className={`${styles.wallet} ${account.isConnected ? styles.connectedWallet : ""}`}
        aria-label={`${account.isConnected ? `Open wallet${account.address ? ` ${account.address}` : ""}` : 'Connect wallet'}${activeCount ? `, ${activeCount} pending transactions` : ''}`}>
        {account.isConnected && <span className={styles.walletPoints} title={account.error ?? (account.isLoading ? "Loading Points balance" : account.points === null ? "Points balance unavailable" : `${points} spendable Points`)} aria-label={account.points === null ? "Points balance unavailable" : `${points} spendable Points`}>
          <FigmaIcon name="trophy" size={18} /><span>{points}</span>
        </span>}
        <span className={styles.walletAddress}><FigmaIcon name="wallet" size={18} /><span className={styles.walletLabel}>{account.isConnected ? account.displayAddress ?? "Wallet" : "Connect wallet"}</span></span>
        {!account.isConnected && <span className={styles.walletSpacer} aria-hidden="true" />}
        {account.isConnected && activeCount > 0 && <span className={styles.pending}>{activeCount}</span>}
      </RevampButton>
      <RevampButton variant="secondary" size="icon" disabled className={styles.notifications}
        aria-label="Notifications (coming soon)" title="Notifications are coming soon">
        <FigmaIcon name="bell" />
      </RevampButton>
      <RevampButton variant="secondary" size="icon" className={styles.theme}
        onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        <RevampIcon name={theme === "dark" ? "sun" : "moon"} />
      </RevampButton>
    </div>
  </header>;
}

export function RevampSiteFooter() {
  return <footer className={styles.footer}>
    <span>© {new Date().getFullYear()} CKBoost</span>
    <div><Link href="/docs" prefetch={false}>Documentation</Link>{"          "}<a href="https://github.com/Alive24/CKBoost" target="_blank" rel="noreferrer">GitHub</a></div>
  </footer>;
}

export function RevampSiteShell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>
    <a href="#revamp-main" className={styles.skip}>Skip to campaigns</a>
    <RevampSiteHeader />{children}<RevampSiteFooter />
  </div>;
}
