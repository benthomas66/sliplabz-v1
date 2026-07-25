import type { ReactNode } from 'react';

// Static metadata only — NEVER derived from evidence data, so no prohibited
// field can reach the document <head>. Enumerated in the serialization audit.
export const metadata = {
  title: 'SlipLabz Board',
  description: 'SlipLabz Board vertical slice.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
