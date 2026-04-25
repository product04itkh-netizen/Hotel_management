import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LPT Hotel Management System',
  description: 'Professional hotel management system with reservations, front desk, housekeeping, billing and more.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  )
}
