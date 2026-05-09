import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OnlyOne Homestay — Management System',
  description: 'Property management system for OnlyOne Homestay — Kampot & Srae Ambel branches. Reservations, front desk, housekeeping, billing and more.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  )
}
