import type { Metadata } from "next";
import { RevampThemeProvider } from "@/components/revamp/theme";

export const metadata: Metadata = {
  title: "CKBoost · Revamp preview",
  robots: { index: false, follow: false },
};

export default function RevampLayout({ children }: { children: React.ReactNode }) {
  return <RevampThemeProvider>{children}</RevampThemeProvider>;
}
