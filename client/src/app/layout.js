import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { SITE_NAME, SITE_URL } from '@/lib/config';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

/** Site-wide SEO defaults; pages override title/description/openGraph. */
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - Learn. Build. Grow.`, template: `%s | ${SITE_NAME}` },
  description: 'Online courses with recorded lessons, live classes, projects and certificates.',
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: '/' },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
