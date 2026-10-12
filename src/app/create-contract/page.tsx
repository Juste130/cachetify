import { CreateContractPage } from "@/components/pages/create-contract-page";

interface PageProps {
    searchParams: Promise<{ template?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams;
    return <CreateContractPage template={params.template} />;
}
