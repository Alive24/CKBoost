import { Tippings } from "@/components/tippings";
import { TippingProvider } from "@/lib/providers/tipping-provider";

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Starlight background - only for main content area, not footer */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none bg-white dark:bg-black"
        style={{
          zIndex: 0,
          backgroundImage: `url('/assets/Base%20UI/Starlight%20background.svg')`,
          backgroundSize: "100vw 100vh",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          imageRendering: "pixelated",
          width: "100%",
          height: "100%",
        }}
      />
      <main
        className="max-w-4xl mx-auto px-4 py-8 relative"
        style={{ zIndex: 10 }}
      >
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-4xl">💰</div>
            <h1
              className="text-4xl font-bold text-gray-900 dark:text-white"
              style={{
                fontFamily: "Pixellari, monospace",
              }}
            >
              Community Tipping Proposals
            </h1>
          </div>
          <p className="text-lg text-gray-700 dark:text-white mb-6">
            Discover and support valuable community contributions through tip
            proposals. Vote on community-funded tips or add your own personal
            tips to show appreciation.
          </p>
        </div>

        <Tippings />

        {/* Rabbit at bottom-left - sticky above Footer, showing only right 80% */}
        <div
          className="sticky bottom-0 pointer-events-none overflow-visible"
          style={{
            height: "0",
            zIndex: 30,
            marginBottom: "-2rem", // Offset main's padding to stick directly to footer
          }}
        >
          <div
            className="absolute bottom-0"
            style={{
              left: "calc((min(100vw, 896px) - 100vw) / 2 + 20px)", // max-w-4xl is 896px
              width: "100px",
              height: "50px",
            }}
          >
            <img
              src="/assets/branding/Rabbit.svg"
              alt="Rabbit"
              className="hidden dark:block"
              style={{
                position: "absolute",
                width: "auto",
                height: "50px",
                left: "-50px", // Pull it left to show only right 80%
                bottom: "0",
                maxHeight: "30vh",
                imageRendering: "pixelated",
                opacity: 1,
              }}
            />
            <img
              src="/assets/branding/Rabbit  - Inverted .svg"
              alt="Rabbit Inverted"
              className="block dark:hidden"
              style={{
                position: "absolute",
                width: "auto",
                height: "50px",
                left: "-50px", // Pull it left to show only right 80%
                bottom: "0",
                maxHeight: "30vh",
                imageRendering: "pixelated",
                opacity: 1,
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
