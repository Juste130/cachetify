import { Suspense } from "react";
import { LoginPage } from "@/components/pages/login-page";

export default function Page() {
    return (
        <Suspense>
            <LoginPage />
        </Suspense>
    );
}
