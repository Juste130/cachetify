import { Spinner } from "@/components/ui/spinner";

/**
 * Next.js route-segment fallback, shown automatically while `/dashboard`'s RSC payload and
 * JS chunk are being fetched during the client-side transition from /login right after a
 * Privy sign-in. Without this file, Next.js has no Suspense boundary for this segment and
 * simply leaves the previous page's UI on screen, frozen, until the new one is fully ready —
 * on a slow chunk load that reads as a stall rather than progress. Same `Spinner` component
 * and centered layout as `ProtectedRoute`'s own session-check fallback, so the two read as
 * one continuous loading sequence instead of two different-looking screens.
 *
 * This renders as the `{children}` slot next to <AppSidebar/> (mounted once in
 * ProtectedRoute, never here) — same flex-1/marginLeft treatment as every page's own <main>,
 * so the sidebar stays put and only the content area shows this fallback.
 */
export default function DashboardLoading() {
  return (
    <main
      className="flex-1 flex items-center justify-center min-h-screen"
      style={{ marginLeft: "var(--sidebar-width, 256px)" }}
    >
      <Spinner size="xl" label="Chargement de votre tableau de bord..." />
    </main>
  );
}
