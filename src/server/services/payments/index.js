const { config } = require('../../config');
const { DisabledPaymentProvider } = require('./provider');

// When PAYMENTS_ENABLED=true and a real provider is implemented (e.g. services/payments/fedapay.js),
// branch on config here. Until then every environment gets the disabled stub, deliberately —
// there is no real aggregator to fall back to.
const paymentProvider = new DisabledPaymentProvider();

module.exports = { paymentProvider };
