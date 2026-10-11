const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { config } = require('./config');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/error-handler');
const { verifyOrigin } = require('./middleware/verify-origin');
const { generalLimiter } = require('./middleware/rate-limit');
const blockchainSyncService = require('./services/blockchain-sync');
const escrowScheduler = require('./services/escrow-scheduler');
const syncHealthScheduler = require('./services/sync-health');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const aiRoutes = require('./routes/ai');
const ipfsRoutes = require('./routes/ipfs');
const contractRoutes = require('./routes/contract');
const escrowRoutes = require('./routes/escrow');
const incidentRoutes = require('./routes/incident');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const kycRoutes = require('./routes/kyc');

const app = express();

// Doit etre defini avant tout middleware qui lit req.ip (express-rate-limit en particulier)
// — voir config/index.js pour le detail de ce que ca corrige.
app.set('trust proxy', config.trustProxy);

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: {policy: "cross-origin"}
}));
app.use(cookieParser());
app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim()),
    },
}));

// CSRF hardening: the accessToken cookie is sameSite:'none' in production (needed for a
// frontend/API on separate domains), so this catches a cross-site request that would
// otherwise ride along on that cookie — see verify-origin.js for the full reasoning.
app.use('/api/', verifyOrigin);

// Rate limiting
app.use('/api/', generalLimiter);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/contracts', escrowRoutes);
app.use('/api/contracts', incidentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/kyc', kycRoutes);

// NOTE: le job horaire de réconciliation des wallets a été retiré — avec Privy, le
// wallet est fourni par le client dès l'authentification, il n'y a plus de scénario
// "utilisateur sans wallet" à rattraper.

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.port;

app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Frontend URL: ${config.frontendUrl}`);

    // Start blockchain event listener
    try {
        await blockchainSyncService.startEventListener();
        logger.info('Blockchain event listener started');
    } catch (error) {
        logger.error('Failed to start blockchain event listener:', error);
    }

    escrowScheduler.start();
    syncHealthScheduler.start();
});

module.exports = app;