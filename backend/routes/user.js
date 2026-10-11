const express = require('express');
const router = express.Router();
const userController = require('../controllers/user');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { walletLimiter, inviteLimiter } = require('../middleware/rate-limit');

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, userController.getProfile);

/**
 * @route   PUT /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', authenticate, userController.updateProfile);

/**
 * @route   GET /api/users/wallet
 * @desc    Get user wallet
 * @access  Private
 */
router.get('/wallet', authenticate, walletLimiter, userController.getWallet);

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private/Admin
 */
router.get('/', authenticate, requireAdmin, userController.getAllUsers);

/**
 * @route   GET /api/users/summary
 * @desc    Platform-wide user counts, not truncated by pagination (admin only)
 * @access  Private/Admin
 */
router.get('/summary', authenticate, requireAdmin, userController.getUsersSummary);

/**
 * @route   PUT /api/users/:userId/role
 * @desc    Update user role (admin only)
 * @access  Private/Admin
 */
router.put('/:userId/role', authenticate, requireAdmin, userController.updateUserRole);

/**
 * @route   DELETE /api/users/:userId
 * @desc    Deactivate ("suspend") user (admin only)
 * @access  Private/Admin
 */
router.delete('/:userId', authenticate, requireAdmin, userController.deactivateUser);

/**
 * @route   POST /api/users/:userId/activate
 * @desc    Reactivate a suspended user (admin only)
 * @access  Private/Admin
 */
router.post('/:userId/activate', authenticate, requireAdmin, userController.activateUser);

/**
 * @route   POST /api/users/invite
 * @desc    Invite someone without a Cachetify account yet, by email
 * @access  Private (any authenticated user)
 */
router.post('/invite', authenticate, inviteLimiter, userController.inviteUser);

module.exports = router;
