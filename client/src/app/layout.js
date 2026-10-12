import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { SITE_NAME, SITE_URL } from '@/lib/config';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

/** The portal is private (login required); pages opt in to indexing individually. */
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - Learning portal`, template: `%s | ${SITE_NAME}` },
  description: 'Log in to your courses: recorded lessons, live classes, projects and certificates.',
  applicationName: SITE_NAME,
  robots: { index: false, follow: false }
};

/** Mobile: fit the screen, extend into the notch area, purple browser bar on Android. */
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#5b21b6' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
