'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode, useState } from 'react';
import { AuthInitializer } from '@/components/auth/auth-initializer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Web3Provider } from "@/contexts/web3-context";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { SidebarWidthHandler } from "@/components/layout/sidebar-width-handler";
import { ProtectedRoute } from "@/components/auth/protected-route";

import { polygonAmoy } from 'viem/chains';

export default function Providers({ children }: { children: ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  const appProviders = (
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <SidebarProvider>
          <SidebarWidthHandler>
            <ProtectedRoute>
              <AuthInitializer />
              {children}
            </ProtectedRoute>
          </SidebarWidthHandler>
        </SidebarProvider>
      </Web3Provider>
    </QueryClientProvider>
  );

  if (!privyAppId) {
    console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set. PrivyProvider disabled.');
    return appProviders;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: '#212121',
          accentColor: '#FFC107',
          logo: '/mark-seal.svg',
          landingHeader: 'Connexion à Cachetify',
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
        // Wallet embarqué (EOA) classique — le gas est couvert par le sponsoring natif
        // Privy ("App pays", activé côté Dashboard), pas par des smart wallets ERC-4337 :
        // ceux-ci nécessiteraient un SmartWalletsProvider séparé, jamais mis en place ici.
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        defaultChain: polygonAmoy,
        supportedChains: [polygonAmoy],
      }}
    >
      {appProviders}
    </PrivyProvider>
  );
}
