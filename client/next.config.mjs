/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  // Lets the dev server be opened from a phone on the same Wi-Fi (http://192.168.1.6:3000).
  allowedDevOrigins: ['192.168.1.6'],

  // This site is the learners' portal: customers arrive from the password email, so there is no
  // public marketing site. The old public URLs all lead to the login page.
  async redirects() {
    return [
      { source: '/', destination: '/login', permanent: false },
      { source: '/courses', destination: '/login', permanent: false },
      { source: '/courses/:path*', destination: '/login', permanent: false },
      { source: '/tutors', destination: '/login', permanent: false },
      { source: '/tutors/:path*', destination: '/login', permanent: false },
      { source: '/pages/about-us', destination: '/login', permanent: false },
      { source: '/register', destination: '/login', permanent: false }
    ];
  }
};

export default nextConfig;
