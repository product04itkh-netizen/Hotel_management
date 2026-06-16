import * as XLSX from 'xlsx'

export function exportXlsx(filename: string, sheets: { name: string; rows: Record<string, any>[] }[]) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
    // Auto-fit column widths based on content
    const colWidths: number[] = []
    if (rows.length > 0) {
      Object.keys(rows[0]).forEach((key, i) => {
        const max = Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length))
        colWidths[i] = Math.min(Math.max(max + 2, 10), 40)
      })
      ws['!cols'] = colWidths.map(w => ({ wch: w }))
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  })
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
