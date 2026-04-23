import { PrismaClient, type Plan } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_USERS: Array<{
  email: string;
  password: string;
  name: string;
  plan: Plan;
}> = [
  {
    email: 'florin@test.com',
    password: '123456',
    name: 'Florin',
    plan: 'FREE_TRIAL',
  },
  {
    email: 'robert@test.com',
    password: '123456',
    name: 'Robert',
    plan: 'FREE_TRIAL',
  },
  {
    email: 'antonio@test.com',
    password: '123456',
    name: 'Antonio',
    plan: 'FREE_TRIAL',
  },
];

async function main(): Promise<void> {
  for (const user of TEST_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        passwordHash,
        name: user.name,
        isEmailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        plan: user.plan,
        trialEndsAt,
      },
      create: {
        email: user.email,
        passwordHash,
        name: user.name,
        isEmailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        plan: user.plan,
        trialEndsAt,
      },
    });

    console.log(`Created or updated ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error('Failed to create test users:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
