/**
 * Seeds the data the platform needs to run: roles, the first admin account,
 * default settings, starter categories, static pages and homepage content.
 * Safe to run repeatedly - existing rows are left untouched.
 *
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Str0ngPass!' npm run seed
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const { sequelize, Role, User, UserProfile, Category, CmsPage, CmsContent, Setting } = await import('../models/index.js');
const { SETTING_DEFINITIONS } = await import('../services/settingsService.js');

const ROLES = [
  { name: 'student', description: 'Student / learner account' },
  { name: 'tutor', description: 'Tutor / instructor account' },
  { name: 'admin', description: 'Administrator account' }
];

const CATEGORIES = [
  { name: 'Astronomy', slug: 'astronomy', description: 'Stars, planets, galaxies and the universe.' },
  { name: 'Physics', slug: 'physics', description: 'From classical mechanics to quantum physics.' },
  { name: 'Space Technology', slug: 'space-technology', description: 'Rockets, satellites and space missions.' },
  { name: 'Science Communication', slug: 'science-communication', description: 'Explaining science to the world.' }
];

const PAGES = [
  { slug: 'about-us', title: 'About Us', content: '<p>Tell your learners about ATV Academy here.</p>' },
  { slug: 'terms-and-conditions', title: 'Terms & Conditions', content: '<p>Add your terms and conditions here.</p>' },
  { slug: 'privacy-policy', title: 'Privacy Policy', content: '<p>Add your privacy policy here.</p>' },
  { slug: 'refund-policy', title: 'Refund Policy', content: '<p>Add your refund policy here.</p>' },
  { slug: 'contact-us', title: 'Contact Us', content: '<p>Add your contact details here.</p>' }
];

const CONTENTS = [
  { section_key: 'hero', title: 'Learn from the best, at your own pace', content: 'Recorded lessons, live classes, projects and certificates - all in one place.', data: { cta_label: 'Browse Courses', cta_link: '/courses' } },
  { section_key: 'features', title: 'Why ATV Academy', data: { items: [
    { title: 'Recorded video lessons', text: 'Watch anytime and track your progress.' },
    { title: 'Live classes', text: 'Join scheduled Zoom sessions with your tutors.' },
    { title: 'Projects & certificates', text: 'Build a final project and earn a certificate.' },
    { title: 'Lifetime community', text: 'Learn together with other students forever.' }
  ] } },
  { section_key: 'featured_courses', title: 'Featured Courses', data: { course_ids: [] } },
  { section_key: 'faq', title: 'Frequently Asked Questions', data: { items: [
    { question: 'How long do I have access?', answer: 'Purchased courses remain available in My Courses.' },
    { question: 'How do I get a certificate?', answer: 'Complete 90% of the lectures, submit the final project and get it approved by your tutor.' }
  ] } },
  { section_key: 'footer', title: 'ATV Academy', content: 'Learn. Build. Grow.', data: { links: [] } }
];

const run = async () => {
  await sequelize.authenticate();

  for (const role of ROLES) {
    await Role.findOrCreate({ where: { name: role.name }, defaults: { ...role, status: 'active' } });
  }
  const adminRole = await Role.findOne({ where: { name: 'admin' } });

  let admin = await User.findOne({ where: { role_id: adminRole.id }, order: [['id', 'ASC']] });
  if (!admin) {
    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@atvacademy.local').toLowerCase();
    const generated = !process.env.SEED_ADMIN_PASSWORD;
    const password = process.env.SEED_ADMIN_PASSWORD || `${crypto.randomBytes(9).toString('base64url')}9a`;
    admin = await User.create({
      role_id: adminRole.id,
      first_name: process.env.SEED_ADMIN_FIRST_NAME || 'Platform',
      last_name: process.env.SEED_ADMIN_LAST_NAME || 'Admin',
      email,
      password_hash: await bcrypt.hash(password, 12),
      status: 'active',
      email_verified_at: new Date()
    });
    await UserProfile.create({ user_id: admin.id });
    console.log(`[seed] admin created: ${email}`);
    if (generated) console.log(`[seed] generated admin password (change it after first login): ${password}`);
  } else {
    console.log(`[seed] admin exists: ${admin.email}`);
  }

  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    // Credentials are not copied into the DB: they keep resolving from .env until an admin sets them.
    if (def.secret || def.env) continue;
    await Setting.findOrCreate({
      where: { setting_key: key },
      defaults: { setting_key: key, setting_value: def.default ?? null, setting_group: def.group, is_public: Boolean(def.public), updated_by: admin.id }
    });
  }

  for (const category of CATEGORIES) await Category.findOrCreate({ where: { slug: category.slug }, defaults: { ...category, status: 'active' } });

  for (const page of PAGES) {
    await CmsPage.findOrCreate({
      where: { slug: page.slug },
      defaults: { ...page, status: 'published', created_by: admin.id, updated_by: admin.id, published_at: new Date(), meta_title: page.title }
    });
  }

  for (const content of CONTENTS) {
    await CmsContent.findOrCreate({ where: { section_key: content.section_key }, defaults: { ...content, status: 'active', updated_by: admin.id } });
  }

  console.log('[seed] done');
  await sequelize.close();
};

run().catch(async (error) => {
  console.error('[seed] failed:', error.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
