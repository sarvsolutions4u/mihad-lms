/** Lets students add the portal to their phone or tablet home screen — it then opens full-screen like an app. */
export default function manifest() {
  return {
    name: 'Mihad Training — Learning Portal',
    short_name: 'Mihad LMS',
    description: 'Lessons, notes, courses, attendance and messages for Al Mihad students, trainers and parents.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#faf7f2',
    theme_color: '#7a121d',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
