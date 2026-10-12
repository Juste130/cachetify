import { ethers } from 'ethers';


const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_BLOCKCHAIN === 'true';

export interface ContractDetails {
    id: string;
    creator: string;
    createdAt: number;
    expiresAt: number;
    status: number;
    totalAmount: string;
    releasedAmount: string;
}

/**
 * Convertit un ID de chaîne en format hexadécimal pour MetaMask
 */
const toHex = (value: string | number) => {
    if (typeof value === 'string' && value.startsWith('0x')) return value;
    return `0x${Number(value).toString(16)}`;
};

export const web3Provider = {
    /**
     * Get ethers provider
     */
    async getProvider() {
        if (typeof window === 'undefined') return null;

        if (MOCK_MODE) {
            console.warn('Web3 Provider: Running in MOCK mode');
            return null;
        }

        if (window.ethereum) {
            return new ethers.BrowserProvider(window.ethereum as any);
        }

        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
        if (!rpcUrl) {
            console.warn('Web3 Provider: No RPC URL provided');
            return null;
        }

        return new ethers.JsonRpcProvider(rpcUrl);
    },

    /**
     * Connect wallet
     */
    async connectWallet(): Promise<string | null> {
        if (MOCK_MODE) {
            console.warn('Web3 Provider: Mocking wallet connection');
            return '0xMockWalletAddress' + Math.floor(Math.random() * 10000);
        }

        if (typeof window === 'undefined' || !window.ethereum) {
            throw new Error('MetaMask non détecté. Veuillez installer une extension de wallet.');
        }

        try {
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            }) as string[];

            if (!accounts || accounts.length === 0) {
                throw new Error('Aucun compte trouvé');
            }

            return accounts[0];
        } catch (error: any) {
            console.error('Wallet connection error:', error);
            if (error.code === 4001) {
                throw new Error('Connexion refusée par l\'utilisateur');
            }
            throw new Error('Erreur lors de la connexion au wallet');
        }
    },

    /**
     * Get balance
     */
    async getBalance(address: string): Promise<string> {
        if (MOCK_MODE) return '10.5';

        try {
            const provider = await this.getProvider();
            if (!provider) return '0';

            const balance = await provider.getBalance(address);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error('Balance fetch error:', error);
            return '0';
        }
    },

    /**
     * Switch to Polygon Amoy Testnet
     */
    async switchNetwork() {
        if (MOCK_MODE) return;

        if (typeof window === 'undefined' || !window.ethereum) return;

        const chainId = toHex(process.env.NEXT_PUBLIC_CHAIN_ID || 80002); // Amoy testnet

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId }],
            });
        } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId,
                                chainName: 'Polygon Amoy Testnet',
                                nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                                rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc-amoy.polygon.technology'],
                                blockExplorerUrls: [process.env.NEXT_PUBLIC_BLOCK_EXPLORER || 'https://amoy.polygonscan.com'],
                            },
                        ],
                    });
                } catch (addError) {
                    console.error('Error adding network:', addError);
                    throw new Error('Impossible d\'ajouter le réseau à MetaMask');
                }
            } else {
                console.error('Error switching network:', switchError);
                throw new Error('Erreur lors du changement de réseau');
            }
        }
    }
};
