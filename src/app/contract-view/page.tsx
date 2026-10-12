import { ContractViewPage } from "@/components/pages/contract-view-page";

interface PageProps {
    searchParams: Promise<{ id?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams;
    const id = params.id ?? "";

    if (!id) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-muted-foreground">Identifiant de contrat manquant.</p>
            </div>
        );
    }

    return <ContractViewPage id={id} />;
}
