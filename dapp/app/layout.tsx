import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { parseLogLevel, setLogLevel, type LogLevel } from "ssri-ckboost/logging";

export const metadata: Metadata = {
  title: "CKBoost",
  description: "Decentralized campaign platform on CKB blockchain for community contribution rewards",
  generator: "Next.js",
};

const defaultLogLevel: LogLevel = process.env.NODE_ENV === "production" ? "error" : "debug";
setLogLevel(parseLogLevel(
  process.env.NEXT_PUBLIC_CKBOOST_LOG_LEVEL ?? process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.CKBOOST_LOG_LEVEL ?? process.env.LOG_LEVEL,
  defaultLogLevel,
));

/** Keep one wallet/query instance while route layouts keep Nextra and its page
 * map outside public discovery. Business contexts are loaded by active route. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className="font-sans antialiased"><Providers>{children}</Providers></body></html>;
}
