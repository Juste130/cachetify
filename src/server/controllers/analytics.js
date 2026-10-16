const prisma = require('../db');

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds the last `months` calendar-month buckets (oldest first, current month last),
 * each pre-seeded at zero so a month with no activity still shows up as a real "0" data
 * point instead of silently disappearing from the chart.
 */
function buildMonthBuckets(months) {
    const now = new Date();
    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
            key: monthKey(d),
            label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
            users: 0,
            contractsCreated: 0,
            contractsSigned: 0,
            logins: 0,
        });
    }
    return buckets;
}

/**
 * Real, DB-backed monthly trends for the admin Analytics page — replaces what used to be
 * hardcoded fictional chart data. Three series:
 *  - users: new accounts created that month (real signups)
 *  - contractsCreated / contractsSigned: contracts created that month, and contracts that
 *    reached ACTIVE/COMPLETED that month (approximated via `lastSync`, the closest signal
 *    this schema tracks to "the month a contract's status last changed" — there's no
 *    dedicated signedAt field)
 *  - logins: refresh tokens issued that month, i.e. one per successful sign-in — used as
 *    the "affluence" (site activity) proxy, since the app doesn't run separate pageview
 *    tracking and adding one would be a privacy-relevant change beyond this endpoint's scope
 */
exports.getMonthlyStats = async (monthsParam) => {
        const months = Math.min(Math.max(parseInt(monthsParam) || 6, 1), 24);
        const since = new Date();
        since.setDate(1);
        since.setHours(0, 0, 0, 0);
        since.setMonth(since.getMonth() - (months - 1));

        const buckets = buildMonthBuckets(months);
        const byKey = buckets.reduce((acc, b) => { acc[b.key] = b; return acc; }, {});

        const [users, contracts, logins] = await Promise.all([
            prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
            prisma.contractCache.findMany({
                where: { createdAt: { gte: since } },
                select: { createdAt: true, lastSync: true, status: true },
            }),
            prisma.refreshToken.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ]);

        for (const u of users) {
            const b = byKey[monthKey(new Date(u.createdAt))];
            if (b) b.users += 1;
        }
        for (const c of contracts) {
            const createdBucket = byKey[monthKey(new Date(c.createdAt))];
            if (createdBucket) createdBucket.contractsCreated += 1;
            if (c.status === 'ACTIVE' || c.status === 'COMPLETED') {
                const signedBucket = byKey[monthKey(new Date(c.lastSync))];
                if (signedBucket) signedBucket.contractsSigned += 1;
            }
        }
        for (const t of logins) {
            const b = byKey[monthKey(new Date(t.createdAt))];
            if (b) b.logins += 1;
        }

        // Growth: new users this month vs. the month before, as a percentage — replaces the
        // previously hardcoded "+18%" figure with a real, if occasionally undefined
        // (no users last month to compare against), computation.
        const last = buckets[buckets.length - 1];
        const prev = buckets[buckets.length - 2];
        const userGrowthPercent = prev && prev.users > 0
            ? Math.round(((last.users - prev.users) / prev.users) * 100)
            : null;

        return { months: buckets, userGrowthPercent };
};
