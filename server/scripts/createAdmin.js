/**
 * Creates an admin login account (or promotes/resets an existing user).
 *
 *   npm run create-admin -- --email admin@example.com --password "Str0ngPass!" --first-name Site --last-name Admin
 *   npm run create-admin -- --email admin@example.com            (password is generated and printed once)
 *   npm run create-admin -- --email admin@example.com --reset    (existing admin: set a new password)
 *
 * Uses DB_* from .env. Passwords are stored as bcrypt hashes.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const flag = (name) => args.includes(`--${name}`);

const email = String(arg('email') || process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
const givenPassword = arg('password') || process.env.SEED_ADMIN_PASSWORD || null;
const firstName = arg('first-name') || 'Platform';
const lastName = arg('last-name') || 'Admin';

const generatePassword = () => {
  const body = crypto.randomBytes(12).toString('base64url');
  return `${body}A7!`; // guarantees upper case, digit and symbol
};

const fail = (message) => {
  console.error(`[create-admin] ${message}`);
  process.exit(1);
};

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Provide a valid --email.');
if (givenPassword && (givenPassword.length < 8 || !/[A-Za-z]/.test(givenPassword) || !/\d/.test(givenPassword))) {
  fail('Password must be at least 8 characters and contain a letter and a number.');
}

const { sequelize, Role, User, UserProfile } = await import('../models/index.js');

try {
  await sequelize.authenticate();
  const [adminRole] = await Role.findOrCreate({ where: { name: 'admin' }, defaults: { name: 'admin', description: 'Administrator account', status: 'active' } });

  const password = givenPassword || generatePassword();
  const existing = await User.findOne({ where: { email }, include: [{ model: Role, as: 'role' }] });

  if (existing) {
    if (existing.role.name === 'admin' && !flag('reset') && !givenPassword) {
      console.log(`[create-admin] ${email} is already an admin. Use --reset to set a new password.`);
      process.exit(0);
    }
    if (existing.role.name !== 'admin' && !flag('promote')) {
      fail(`${email} already exists as a ${existing.role.name}. Re-run with --promote to make it an admin.`);
    }
    await existing.update({
      role_id: adminRole.id,
      password_hash: await bcrypt.hash(password, 12),
      status: 'active',
      email_verified_at: existing.email_verified_at || new Date()
    });
    console.log(`[create-admin] ${existing.role.name === 'admin' ? 'Password reset for' : 'Promoted to admin:'} ${email}`);
  } else {
    await sequelize.transaction(async (transaction) => {
      const user = await User.create(
        {
          role_id: adminRole.id,
          first_name: firstName,
          last_name: lastName,
          email,
          password_hash: await bcrypt.hash(password, 12),
          status: 'active',
          email_verified_at: new Date()
        },
        { transaction }
      );
      await UserProfile.create({ user_id: user.id }, { transaction });
    });
    console.log(`[create-admin] Admin account created: ${email}`);
  }
  if (!givenPassword) console.log(`[create-admin] Password (shown once - store it safely, then change it): ${password}`);
} catch (error) {
  fail(error.message);
} finally {
  await sequelize.close();
}
