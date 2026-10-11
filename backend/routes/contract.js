const express = require('express');
const multer = require('multer');
const router = express.Router();
const contractController = require('../controllers/contract');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { resendLimiter, verifyLimiter } = require('../middleware/rate-limit');

// Le certificat officiel reste un PDF modeste (quelques pages) ; 10 Mo laisse une bonne
// marge, la même limite que le dépôt de documents (routes/ipfs.js).
const uploadCertificate = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * @route   POST /api/contracts/draft
 * @desc    Save a new contract draft and wait for signers
 * @access  Private
 */
router.post('/draft', authenticate, contractController.saveDraft);

/**
 * @route   GET /api/contracts/draft/:id
 * @desc    Get details of a draft contract
 * @access  Private
 */
router.get('/draft/:id', authenticate, contractController.getDraftDetails);

/**
 * @route   POST /api/contracts/draft/:id/deploy
 * @desc    Mark draft as deployed with on-chain ID
 * @access  Private
 */
router.post('/draft/:id/deploy', authenticate, contractController.markDraftDeployed);

/**
 * @route   POST /api/contracts/:id/resend-signature
 * @desc    Resend an invitation/signature request email to a signatory who hasn't signed yet
 * @access  Private
 */
router.post('/:id/resend-signature', authenticate, resendLimiter, contractController.resendSignatureRequest);

/**
 * @route   GET /api/contracts/cached
 * @desc    Get cached contracts for current user
 * @access  Private
 */
router.get('/cached', authenticate, contractController.getCachedContracts);

/**
 * @route   GET /api/contracts/summary
 * @desc    Get accurate per-status contract counts for the current user (not limited to one page)
 * @access  Private
 */
router.get('/summary', authenticate, contractController.getContractsSummary);

/**
 * @route   POST /api/contracts/sync/:contractId
 * @desc    Sync specific contract
 * @access  Private
 */
router.post('/sync/:contractId', authenticate, contractController.syncContract);

/**
 * @route   POST /api/contracts/sync-all
 * @desc    Sync all user contracts
 * @access  Private
 */
router.post('/sync-all', authenticate, contractController.syncAllContracts);

/**
 * @route   GET /api/contracts/search
 * @desc    Search contracts
 * @access  Private
 */
router.get('/search', authenticate, contractController.searchContracts);

/**
 * @route   GET /api/contracts/:contractId
 * @desc    Get contract details
 * @access  Private
 */
router.get('/:contractId', authenticate, contractController.getContractDetails);

/**
 * @route   POST /api/contracts/:contractId/certificate
 * @desc    Dépose le certificat officiel (une seule fois, le premier arrivé gagne) — voir
 *          storeCertificate.
 * @access  Private (creator, signatory, or admin of the contract)
 */
router.post('/:contractId/certificate', authenticate, uploadCertificate.single('file'), contractController.storeCertificate);

/**
 * @route   GET /api/contracts/verify/:token
 * @desc    Public, unauthenticated verification lookup, gated by a non-guessable 128-bit
 *          token (never a sequential contract id) — reference, status, hash and signatories'
 *          initials only, never the title or a full name. This is what the QR code on a
 *          downloaded certificate points to.
 * @access  Public
 */
router.get('/verify/:token', verifyLimiter, contractController.getPublicVerification);

/**
 * @route   GET /api/contracts/admin/all
 * @desc    Get all contracts (admin only)
 * @access  Private/Admin
 */
router.get('/admin/all', authenticate, requireAdmin, contractController.getAllContracts);

/**
 * @route   GET /api/contracts/admin/summary
 * @desc    Platform-wide contract counts by status, not truncated by pagination (admin only)
 * @access  Private/Admin
 */
router.get('/admin/summary', authenticate, requireAdmin, contractController.getAdminContractsSummary);

/**
 * @route   GET /api/contracts/admin/sync-health
 * @desc    Latest on-chain vs cache drift check (admin only)
 * @access  Private/Admin
 */
router.get('/admin/sync-health', authenticate, requireAdmin, contractController.getSyncHealth);

module.exports = router;
