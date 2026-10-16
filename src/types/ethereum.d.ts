export interface EthereumRequestParams {
    method: string;
    params?: any[] | object;
}

export interface EthereumProvider {
    request: (args: EthereumRequestParams) => Promise<any>;
    on: (event: string, callback: (...args: any[]) => void) => void;
    removeListener: (event: string, callback: (...args: any[]) => void) => void;
    isMetaMask?: boolean;
}

declare global {
    interface Window {
        ethereum?: EthereumProvider;
    }
}
