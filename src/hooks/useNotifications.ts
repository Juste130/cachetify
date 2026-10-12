import { toast } from 'sonner';

export function useNotifications() {
    const notifySuccess = (title: string, description?: string) => {
        toast.success(title, { description });
    };

    const notifyError = (title: string, description?: string) => {
        toast.error(title, { description });
    };

    const notifyInfo = (title: string, description?: string) => {
        toast.info(title, { description });
    };

    const notifyWarning = (title: string, description?: string) => {
        toast.warning(title, { description });
    };

    return {
        notifySuccess,
        notifyError,
        notifyInfo,
        notifyWarning,
    };
}
