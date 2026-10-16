/**
 * Script de bootstrap Admin
 * ========================
 * Promouvoit un utilisateur existant (par email) en ADMIN via la CLI.
 *
 * Usage :
 *   node scripts/seed-admin.js admin@cachetify.io
 *
 * Pré-requis : L'utilisateur doit déjà exister en base de données.
 * Si ce n'est pas le cas, ajoutez son email dans ADMIN_EMAILS dans le .env
 * pour qu'il soit auto-promu à sa prochaine connexion Privy.
 */

const prisma = require('../src/server/db');
const { UserRole } = require('@prisma/client');
const logger = require('../src/server/utils/logger');

async function promoteToAdmin(email) {
    if (!email) {
        console.error('Usage: node scripts/seed-admin.js <email>');
        process.exit(1);
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (!user) {
            console.error(`Aucun utilisateur trouvé pour: ${normalizedEmail}`);
            console.error('  Conseil: L\'utilisateur doit d\'abord se connecter via Privy au moins une fois.');
            process.exit(1);
        }

        if (user.role === UserRole.ADMIN) {
            console.log(`L'utilisateur ${normalizedEmail} est déjà ADMIN. Rien à faire.`);
            process.exit(0);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { role: UserRole.ADMIN },
        });

        // Marquer également le wallet comme admin wallet si présent
        const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
        if (wallet && !wallet.isAdminWallet) {
            await prisma.userWallet.update({
                where: { id: wallet.id },
                data: { isAdminWallet: true },
            });
        }

        console.log(`Succès: ${normalizedEmail} a été promu ADMIN.`);
        console.log(`  ID utilisateur: ${user.id}`);
        console.log('');
        console.log('  Conseil: ajoutez cet email dans ADMIN_EMAILS dans votre .env');
        console.log('  pour maintenir ce statut admin à chaque connexion Privy.');
    } catch (error) {
        console.error('Erreur lors de la promotion admin:', error.message);
        logger.error('seed-admin error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

const targetEmail = process.argv[2];
promoteToAdmin(targetEmail);
