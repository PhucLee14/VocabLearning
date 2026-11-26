/**
 * Makes an account an admin (or a learner again). The admin site can change
 * other people's roles, but the first admin has to be made here.
 *
 *   npm run admin:role -- <email>            → ADMIN
 *   npm run admin:role -- <email> --revoke   → USER
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const emails = args.filter((a) => !a.startsWith('-'));
  if (emails.length !== 1 || args.some((a) => a.startsWith('-') && a !== '--revoke')) {
    throw new Error('Usage: npm run admin:role -- <email> [--revoke]');
  }
  const email = emails[0].trim().toLowerCase();

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DIRECT_URL / DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) throw new Error(`No account with the email ${email}`);
    const role = revoke ? 'USER' : 'ADMIN';
    if (user.role === role) {
      console.log(`${email} is already ${role}.`);
      return;
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role } }),
      prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'user.role',
          targetType: 'user',
          targetId: user.id,
          targetName: email,
          data: { role: [user.role, role], via: 'npm run admin:role' },
        },
      }),
    ]);
    console.log(`✔ ${email} is now ${role}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
