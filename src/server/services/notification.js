const prisma = require('../db');
const logger = require('../utils/logger');

class NotificationService {
    async create(userId, { type, title, message, contractCacheId }) {
        try {
            return await prisma.notification.create({
                data: {
                    userId,
                    type: type || 'GENERIC',
                    title,
                    message,
                    contractCacheId: contractCacheId || null,
                },
            });
        } catch (error) {
            // A failed notification insert must never break the caller's actual action
            // (e.g. releasing an escrow) — log and move on.
            logger.error('Error creating notification:', error);
            return null;
        }
    }

    async listForUser(userId, { unreadOnly = false, limit = 30 } = {}) {
        return prisma.notification.findMany({
            where: { userId, ...(unreadOnly ? { read: false } : {}) },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    async countUnread(userId) {
        return prisma.notification.count({ where: { userId, read: false } });
    }

    async markRead(id, userId) {
        return prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    }

    async markAllRead(userId) {
        return prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    }
}

module.exports = new NotificationService();
