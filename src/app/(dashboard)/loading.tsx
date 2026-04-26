export default function DashboardLoading() {
  return (
    <div className="flex-1 flex flex-col">
      {/* TopBar skeleton */}
      <div className="bg-white border-b border-hborder px-8 h-[60px] flex items-center justify-between flex-shrink-0">
        <div className="space-y-1.5">
          <div className="h-5 w-44 bg-hsurface2 rounded-md animate-pulse" />
          <div className="h-3 w-36 bg-hsurface2 rounded-md animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-6 w-28 bg-hsurface2 rounded-full animate-pulse" />
          <div className="h-6 w-24 bg-hsurface2 rounded-lg animate-pulse" />
          <div className="h-7 w-20 bg-hsurface2 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="p-8 flex-1">
        {/* Stat cards row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 bg-white border border-hborder rounded-2xl shadow-card animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3">
            <div className="h-9 w-52 bg-white border border-hborder rounded-lg animate-pulse" />
            <div className="h-9 w-32 bg-white border border-hborder rounded-lg animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-navy/20 rounded-lg animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <div className="h-11 bg-hsurface2 animate-pulse" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="border-t border-hborder px-5 py-3 flex items-center gap-4 animate-pulse"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="w-8 h-8 rounded-full bg-hsurface2 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/4 bg-hsurface2 rounded" />
                <div className="h-2.5 w-1/6 bg-hsurface2 rounded" />
              </div>
              <div className="h-3 w-20 bg-hsurface2 rounded" />
              <div className="h-3 w-20 bg-hsurface2 rounded" />
              <div className="h-5 w-16 bg-hsurface2 rounded-full" />
              <div className="h-5 w-16 bg-hsurface2 rounded-full" />
              <div className="h-3 w-14 bg-hsurface2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
