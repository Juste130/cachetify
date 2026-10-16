import { PublicVerifyPage } from "@/components/pages/public-verify-page";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
    const { id } = await params;
    return <PublicVerifyPage id={id} />;
}
