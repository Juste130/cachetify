import { Spinner } from "@/components/ui/spinner";

/**
 * `/contract-view` reads `id` from searchParams (forced-dynamic, same reasoning as
 * contract-details/loading.tsx) and is rendered full-screen, without the sidebar (see
 * NO_SIDEBAR_PATH_PREFIXES in protected-route.tsx) — so unlike the other loading.tsx files,
 * this one doesn't need the flex-1/marginLeft treatment.
 */
export default function ContractViewLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <Spinner size="xl" label="Chargement du document..." />
    </div>
  );
}
