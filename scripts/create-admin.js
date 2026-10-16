/* One-off script to create an admin user using Prisma.
Run: node scripts/create-admin.js

It will use values from the project root's .env (dotenv). It will create a User with role ADMIN and
create an associated UserWallet with the address from config.ADMIN_WALLET_ADDRESS.
*/

const dotenv = require('dotenv');
dotenv.config();

const bcrypt = require('bcrypt');
const prisma = require('../src/server/db');
const { UserRole } = require('@prisma/client');
const { config } = require('../src/server/config');

async function main() {
  const email = process.argv[2] || 'houezojuste0@gmail.com';
  const password = process.argv[3] || 'Juste130';
  const adminWallet = config.adminWalletAddress || process.env.ADMIN_WALLET_ADDRESS;

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js [email] [password]');
    process.exit(1);
  }

  console.log(`Creating admin user ${email}`);

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists. Exiting.');
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  if (adminWallet) {
    await prisma.userWallet.create({
      data: {
        userId: user.id,
        publicAddress: adminWallet,
        isAdminWallet: true,
      },
    });
    console.log(`Associated admin wallet ${adminWallet}`);
  } else {
    console.log('No admin wallet address found in config/.env; skipped wallet creation.');
  }

  console.log('Admin user created successfully:', { id: user.id, email: user.email });
  process.exit(0);
}

main().catch((e) => {
  console.error('Error creating admin:', e);
  process.exit(1);
});
