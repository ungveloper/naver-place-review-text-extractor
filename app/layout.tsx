import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Naver Place Visitor Review Extractor',
  description: 'Collect visitor review text from Naver mobile place pages.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
