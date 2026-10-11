const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kyc');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/kyc/status
 * @desc    Current user's verification status
 * @access  Private
 */
router.get('/status', authenticate, kycController.getStatus);

/**
 * @route   POST /api/kyc/submit
 * @desc    Submit a document + selfie for verification
 * @access  Private
 */
router.post('/submit', authenticate, kycController.submit);

/**
 * @route   POST /api/kyc/dismiss-prompt
 * @desc    Mark the one-time post-signup invitation modal as seen
 * @access  Private
 */
router.post('/dismiss-prompt', authenticate, kycController.dismissPrompt);

/**
 * @route   POST /api/kyc/callback
 * @desc    Smile ID's async result webhook
 * @access  Public (gated by signature verification inside the controller, not by session —
 *          Smile ID's servers have no Cachetify auth cookie to send)
 */
router.post('/callback', kycController.callback);

module.exports = router;
