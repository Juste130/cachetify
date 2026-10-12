import { Spinner } from "@/components/ui/spinner";

/**
 * `/contract-details` reads `id` from searchParams, which forces Next.js to treat the route
 * as dynamic — per Next's own docs, a dynamic route with no loading.tsx skips prefetching
 * entirely and the browser just waits, frozen, for a full server round trip before showing
 * anything. This file gives Next a Suspense boundary to show immediately on navigation
 * (and lets it partially prefetch the route), instead of that frozen wait — this is the
 * single most-clicked destination in the app (every "open a contract" click lands here), so
 * it's the one route where this mattered most.
 */
export default function ContractDetailsLoading() {
  return (
    <main
      className="flex-1 flex items-center justify-center min-h-screen"
      style={{ marginLeft: "var(--sidebar-width, 256px)" }}
    >
      <Spinner size="xl" label="Chargement du contrat..." />
    </main>
  );
}
