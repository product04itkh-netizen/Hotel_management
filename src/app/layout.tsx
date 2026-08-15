import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaRegister } from '@/components/PwaRegister'

export const metadata: Metadata = {
  title: 'OnlyOne Homestay — Management System',
  description: 'Property management system for OnlyOne Homestay — Kampot & Srae Ambel branches. Reservations, front desk, housekeeping, billing and more.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.jpg',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OnlyOne PMS',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3A2505',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
