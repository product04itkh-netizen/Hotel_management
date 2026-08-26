const xlsx = require('xlsx');
const fs = require('fs');
try {
  const workbook = xlsx.readFile('c:\\Users\\tonns\\Desktop\\Hotel_Management\\Chart_of_Accounts_2026-06-19_Revise.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);
  fs.writeFileSync('c:\\Users\\tonns\\Desktop\\Hotel_Management\\chart_of_accounts_dump.json', JSON.stringify(data, null, 2));
  console.log('Successfully extracted Excel to chart_of_accounts_dump.json');
} catch (e) {
  console.error('Error reading Excel:', e);
}
