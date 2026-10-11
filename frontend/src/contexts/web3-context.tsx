"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { usePrivy, useWallets, useSendTransaction } from "@privy-io/react-auth"
import { ethers } from "ethers"



interface Web3ContextType {
  account: string | null;           // Adresse EOA Privy (embedded wallet)
  eoaAddress: string | null;        // Alias de account — conservé pour la clarté des call sites
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  chainId: number | null;
  balance: string | null;
  refreshBalance: () => Promise<void>;
  // Envoie une transaction depuis l'EOA Privy, sponsorisée via Privy Native Gas Sponsorship.
  sendTransaction: (to: string, data: string, value?: string) => Promise<{ hash: string }>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined)

// Polygon Amoy testnet by default — matches provider.ts's own fallback. Nothing previously
// checked this before sending a transaction: a wallet left on the wrong network would just
// fail deep inside the RPC call with a confusing error instead of a clear "switch network" message.
const EXPECTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 80002

export function Web3Provider({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const { sendTransaction: privySendTransaction } = useSendTransaction()

  const [balance, setBalance] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)

  // useWallets() only ever returns embedded/external EOA wallets — Privy's native smart
  // wallets are a separate concept (useSmartWallets(), a distinct provider) that this app
  // never actually wired up. There is no smart wallet branch to look for here; gas is
  // covered instead by Privy's native sponsorship ("App pays" mode) on this same EOA.
  const eoaWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0] || null
  const eoaAddress = eoaWallet?.address || null
  const account = eoaAddress

  const isConnected = ready && authenticated && !!account
  const isConnecting = !ready

  const refreshBalance = useCallback(async () => {
    if (!eoaWallet || !account) {
      setBalance(null)
      return
    }
    try {
      const eip1193provider = await eoaWallet.getEthereumProvider()
      const provider = new ethers.BrowserProvider(eip1193provider)
      const rawBalance = await provider.getBalance(account)
      setBalance(parseFloat(ethers.formatEther(rawBalance)).toFixed(4))
    } catch (err) {
      console.warn('[Web3] Failed to fetch wallet balance:', err)
      setBalance('0.0000')
    }
  }, [eoaWallet, account])

  useEffect(() => {
    if (eoaWallet) {
      const cid = eoaWallet.chainId
      if (cid && cid.startsWith('eip155:')) {
        setChainId(Number(cid.split(':')[1]))
      }
      refreshBalance()
    } else {
      setChainId(null)
      setBalance(null)
    }
  }, [eoaWallet, refreshBalance])

  /** Throws a clear, actionable error instead of letting a wrong-network tx fail deep inside the RPC call. */
  const assertExpectedChain = async (eip1193provider: any) => {
    try {
      const hexChainId: string = await eip1193provider.request({ method: 'eth_chainId' })
      const actual = parseInt(hexChainId, 16)
      if (actual !== EXPECTED_CHAIN_ID) {
        throw new Error(`Mauvais réseau : votre wallet est sur la chaîne ${actual}, mais Cachetify fonctionne sur la chaîne ${EXPECTED_CHAIN_ID} (Polygon Amoy). Changez de réseau dans votre wallet avant de continuer.`)
      }
    } catch (err: any) {
      if (err?.message?.startsWith('Mauvais réseau')) throw err
      // If the chainId check itself fails (unsupported RPC method, etc.), don't block the
      // transaction on a diagnostic that couldn't run — let the actual send surface its own error.
      console.warn('[Web3] Could not verify chain id before sending transaction:', err)
    }
  }

  const sendTransaction = useCallback(async (
    to: string,
    data: string,
    value?: string
  ): Promise<{ hash: string }> => {
    if (!eoaWallet) throw new Error('Aucun wallet connecté')

    const eip1193provider = await eoaWallet.getEthereumProvider()
    await assertExpectedChain(eip1193provider)

    // sponsor: true routes this through Privy's native gas sponsorship ("App pays" mode,
    // configured in the Privy Dashboard) instead of a plain ethers signer.sendTransaction —
    // the wallet never needs to hold MATIC, Privy's own infrastructure covers the gas.
    const { hash } = await privySendTransaction(
      {
        to,
        data,
        ...(value ? { value: BigInt(value) } : {}),
      },
      { sponsor: true, address: eoaWallet.address }
    )
    return { hash }
  }, [eoaWallet, eoaAddress, privySendTransaction])

  const connect = async (): Promise<void> => {
    login()
  }

  const disconnect = (): void => {
    logout()
  }

  const contextValue: Web3ContextType = {
    account,
    eoaAddress,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    chainId,
    balance,
    refreshBalance,
    sendTransaction,
  }

  return (
    <Web3Context.Provider value={contextValue}>
      {children}
    </Web3Context.Provider>
  )
}

export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context)
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider")
  }
  return context
}
