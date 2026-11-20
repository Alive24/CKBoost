import { Layout, Navbar, Footer } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import Link from "next/link";
import { Fragment } from "react";
import "nextra-theme-docs/style.css";
import { WalletConnect } from "@/components/wallet-connect";
import { ThemeToggle } from "@/components/theme-toggle";
import { PointsBalance } from "@/components/points-balance";

const navbar = (
  <Navbar
    key="navbar"
    logo={
      <div className="flex items-center gap-2 mr-18">
        <img
          src="/assets/branding/CKBoost Pixel Art Logo - Navigation.svg"
          alt="CKBoost"
          className="h-8 w-auto hidden dark:block"
          style={{ imageRendering: "pixelated" }}
        />
        <img
          src="/assets/branding/CKBoost Pixel Art Logo - Navigation - Inverted.svg"
          alt="CKBoost"
          className="h-8 w-auto block dark:hidden"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    }
    logoLink="/"
    align="left"
  >
    <div className="hidden md:flex items-center gap-3">
      <Link
        href="/docs"
        className="inline-flex items-center rounded-full border border-[#0000FF] px-4 py-2 text-sm font-medium text-[#0000FF] transition-colors hover:bg-[#0000FF] hover:text-white dark:border-white/30 dark:text-white dark:hover:bg-white/10"
      >
        Docs
      </Link>
      <PointsBalance />
      <WalletConnect />
      <ThemeToggle />
    </div>
  </Navbar>
);

const footer = (
  <div
    key="footer"
    style={{ position: "relative", zIndex: 20, backgroundColor: "#000000" }}
  >
    <Footer>© {new Date().getFullYear()} CKBoost.</Footer>
  </div>
);

export default async function LegacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pageMap = await getPageMap();

  return (
      <Layout
        navbar={navbar}
        footer={footer}
        pageMap={pageMap}
        docsRepositoryBase="https://github.com/Alive24/CKBoost/tree/main/dapp/content"
      >
        <Fragment key="page-content">{children}</Fragment>
      </Layout>
  );
}
