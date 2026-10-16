/**
 * Contract every payment provider must satisfy. No real aggregator is wired yet — only
 * DisabledPaymentProvider exists today, which every method rejects with a clear,
 * user-facing "not available" error. Swap in a real implementation (Fedapay, CinetPay,
 * ...) behind this same interface once PAYMENTS_ENABLED=true — nothing else in the
 * escrow flow needs to change.
 */
class PaymentProvider {
    /**
     * Starts a hosted checkout for a deposit.
     * @returns {Promise<{ checkoutUrl: string, providerRef: string }>}
     */
    async createDepositCheckout({ amount, currency, reference, description, returnUrl }) {
        throw new Error('Not implemented');
    }

    /**
     * Validates and parses a webhook callback from the provider.
     * @returns {Promise<{ providerRef: string, amount: number, currency: string, status: 'paid'|'failed'|'pending' }>}
     */
    async parseWebhookEvent(rawBody, headers) {
        throw new Error('Not implemented');
    }

    /**
     * Sends money out to a beneficiary (mobile money number, bank account...).
     * @returns {Promise<{ payoutRef: string }>}
     */
    async payout({ amount, currency, destination, reference }) {
        throw new Error('Not implemented');
    }
}

class PaymentsUnavailableError extends Error {
    constructor(message) {
        super(message || "Le paiement en ligne n'est pas encore disponible sur cette plateforme.");
        this.code = 'PAYMENTS_UNAVAILABLE';
    }
}

class DisabledPaymentProvider extends PaymentProvider {
    async createDepositCheckout() {
        throw new PaymentsUnavailableError();
    }

    async parseWebhookEvent() {
        throw new PaymentsUnavailableError();
    }

    async payout() {
        throw new PaymentsUnavailableError();
    }
}

module.exports = { PaymentProvider, DisabledPaymentProvider, PaymentsUnavailableError };
