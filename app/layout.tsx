import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '네이버 플레이스 방문자 리뷰 수집기',
  description: '네이버 모바일 플레이스 방문자 리뷰 텍스트를 수집합니다.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
