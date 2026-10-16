import { ContractDetailsPage } from "@/components/pages/contract-details-page";

interface PageProps {
    searchParams: Promise<{ id?: string; created?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams;
    const id = params.id ?? "";
    const created = params.created === "true";

    if (!id) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-muted-foreground">Identifiant de contrat manquant.</p>
            </div>
        );
    }

    return <ContractDetailsPage id={id} created={created} />;
}
