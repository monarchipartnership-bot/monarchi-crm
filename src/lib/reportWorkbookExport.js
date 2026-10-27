import { download, safeFileName } from './reportExport';
import { reportWorkbookBlob } from './reportWorkbook';

// «Excel» of a report (or of a whole month): the blocks are made by reportBlock() of reportWorkbook.js, the file is one sheet and goes to the person.
export async function saveReportWorkbook(blocks, { filename, sheetName }) {
  const live = blocks.filter(Boolean);
  if (!live.length) throw new Error('У звіті немає цифр для файлу.');
  download(await reportWorkbookBlob(live, { sheetName }), `${safeFileName(filename)}.xlsx`);
}
