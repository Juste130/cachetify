const { ethers } = require('ethers');
const prisma = require('../db');
const logger = require('../utils/logger');
const { config } = require('../config');
const { AppError } = require('../utils/errors');

// NOTE: la génération/le chiffrement de clé privée custodiale (createUserWallet,
// associateAdminWallet, encryptPrivateKey, fundInitialGas) a été retirée — Privy gère
// désormais entièrement la création des wallets utilisateurs. Le financement en MATIC
// n'est PAS automatique côté Privy : c'est le sponsoring natif Privy ("App pays", activé
// dans le Dashboard Privy) qui couvre le gas transaction par transaction — voir
// frontend/src/contexts/web3-context.tsx (sendTransaction, sponsor: true). Ce service ne
// fait plus que lire les wallets déjà enregistrés via Privy.
class WalletService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.polygonRpcUrl);
    }

    async getUserWallet(userId) {
        return await prisma.userWallet.findUnique({
            where: { userId },
        });
    }

    async getWalletBalance(address) {
        try {
            const balance = await this.provider.getBalance(address);
            return ethers.formatEther(balance);
        } catch (error) {
            logger.error('Error getting wallet balance:', error);
            throw new AppError('Failed to get wallet balance', 500);
        }
    }
}

module.exports = new WalletService();