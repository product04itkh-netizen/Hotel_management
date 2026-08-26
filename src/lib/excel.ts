import * as XLSX from 'xlsx-js-style'

export interface ExportHeader {
  branchName: string
  title: string
  dateStr: string
}

export interface ExportSheet {
  name: string
  rows: Record<string, any>[]
  header?: ExportHeader
}

export function exportXlsx(filename: string, sheets: ExportSheet[]) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows, header }) => {
    const origin = header ? 'A5' : 'A1'
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}], { origin } as any)
    
    const numCols = rows.length > 0 ? Object.keys(rows[0]).length : 0

    if (header) {
      const headerStyle = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: 'center', vertical: 'center' }
      }

      XLSX.utils.sheet_add_aoa(ws, [
        [{ v: header.branchName, t: 's', s: headerStyle }],
        [{ v: header.title, t: 's', s: headerStyle }],
        [{ v: header.dateStr, t: 's', s: headerStyle }],
      ], { origin: 'A1' })

      const mergeEndCol = Math.max(4, numCols - 1) // merge at least 5 cols (A to E)
      if (!ws['!merges']) ws['!merges'] = []
      ws['!merges'].push(
        { s: { r: 0, c: 0 }, e: { r: 0, c: mergeEndCol } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: mergeEndCol } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: mergeEndCol } }
      )
    }

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
