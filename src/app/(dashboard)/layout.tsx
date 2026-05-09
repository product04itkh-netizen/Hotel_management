import { Sidebar } from '@/components/layout/Sidebar'
import { ToastContainer } from '@/components/ui/Toast'
import { BranchProvider } from '@/context/BranchContext'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BranchProvider>
      <div className="flex min-h-screen bg-hbg">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {children}
        </main>
        <ToastContainer />
      </div>
    </BranchProvider>
  )
}
