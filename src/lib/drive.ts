import * as XLSX from 'xlsx';
import { AppState } from '../types';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number | string;
  modifiedTime: string;
  webViewLink?: string;
  iconLink?: string;
}

export const BACKUP_FOLDER_NAME = 'Candy Store & Takehome Backups';

export class InsufficientScopeError extends Error {
  constructor(message = 'Request had insufficient authentication scopes.') {
    super(message);
    this.name = 'InsufficientScopeError';
  }
}

/**
 * Lists files from Google Drive with optional search query and folder filter
 */
export async function listDriveFiles(
  token: string,
  options?: { search?: string; folderId?: string }
): Promise<DriveFile[]> {
  try {
    let folderId = options?.folderId;
    if (!folderId) {
      try {
        folderId = await getOrCreateBackupFolder(token);
      } catch (err: any) {
        if (err instanceof InsufficientScopeError) throw err;
        folderId = '';
      }
    }

    let q = 'trashed=false';
    if (folderId) {
      q += ` and '${folderId}' in parents`;
    }
    if (options?.search && options.search.trim()) {
      const clean = options.search.trim().replace(/'/g, "\\'");
      q += ` and name contains '${clean}'`;
    }

    const fields = 'files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&orderBy=modifiedTime desc&pageSize=50&fields=${encodeURIComponent(fields)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 403 || errorText.includes('insufficient') || errorText.includes('PERMISSION_DENIED')) {
        throw new InsufficientScopeError('Request had insufficient authentication scopes.');
      }
      console.warn('Drive listFiles non-fatal notice:', errorText);
      throw new Error(`Google Drive API error (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    return (data.files || []) as DriveFile[];
  } catch (error) {
    if (error instanceof InsufficientScopeError) {
      throw error;
    }
    console.warn('Google Drive list notice:', error);
    throw error;
  }
}

/**
 * Finds or creates the default application backup folder in Google Drive
 */
export async function getOrCreateBackupFolder(
  token: string,
  folderName: string = BACKUP_FOLDER_NAME
): Promise<string> {
  try {
    // Check if folder already exists
    const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(
      /'/g,
      "\\'"
    )}' and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (searchRes.status === 403) {
      const errText = await searchRes.text();
      if (errText.includes('insufficient') || errText.includes('PERMISSION_DENIED')) {
        throw new InsufficientScopeError('Request had insufficient authentication scopes.');
      }
    }

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Create folder if not found
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Auto-created backup directory for Candy Store & Takehome Inventory'
      })
    });

    if (!createRes.ok) {
      throw new Error('Failed to create backup folder on Google Drive');
    }

    const createdData = await createRes.json();
    return createdData.id;
  } catch (error) {
    console.warn('Folder lookup warning, defaulting to root:', error);
    return '';
  }
}

/**
 * Creates a JSON or Excel backup of the inventory ledger on Google Drive
 */
export async function backupLedgerToDrive(
  token: string,
  state: AppState,
  format: 'json' | 'excel' | 'both' = 'both',
  parentFolderId?: string
): Promise<{ jsonFile?: DriveFile; excelFile?: DriveFile }> {
  const folderId = parentFolderId || (await getOrCreateBackupFolder(token));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branchTag = (state.inv || 'Store').replace(/[^a-zA-Z0-9]/g, '_');
  const results: { jsonFile?: DriveFile; excelFile?: DriveFile } = {};

  // 1. JSON Backup
  if (format === 'json' || format === 'both') {
    const filename = `Inventory_Backup_${branchTag}_${timestamp}.json`;
    const jsonContent = JSON.stringify(
      {
        ...state,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      },
      null,
      2
    );

    const jsonFile = await uploadMultipartFile(
      token,
      filename,
      jsonContent,
      'application/json',
      folderId
    );
    results.jsonFile = jsonFile;
  }

  // 2. Excel Backup
  if (format === 'excel' || format === 'both') {
    const excelFilename = `Inventory_Report_${branchTag}_${timestamp}.xlsx`;
    const excelBuffer = generateExcelReportBuffer(state);

    const excelFile = await uploadMultipartBinary(
      token,
      excelFilename,
      excelBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      folderId
    );
    results.excelFile = excelFile;
  }

  return results;
}

/**
 * Generates an Excel workbook buffer from AppState
 */
export function generateExcelReportBuffer(state: AppState): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Overview Sheet
  const overviewData = [
    ['CANDY STORE & TAKEHOME INVENTORY - SYSTEM REPORT'],
    ['Generated Date', new Date().toLocaleString()],
    ['Store / Branch Location', state.inv],
    ['Start Date', state.start],
    ['Cut Off Date', state.cut],
    ['Total Registered Items', state.items?.length || 0],
    ['Total Shift Entry Rows', state.rows?.length || 0],
    ['Active Branches Count', state.locs?.length || 0],
    ['Cashiers Count', state.cashiers?.length || 0],
    [],
    ['Branch Locations List:']
  ];
  (state.locs || []).forEach(loc => overviewData.push(['- ' + loc]));

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Store Overview');

  // Items Master Sheet
  const itemsRows = (state.items || []).map(it => ({
    'Line #': it.no,
    'Item Code': it.code,
    'System Description': it.sys,
    'Display Description': it.desc,
    'Category': it.cat,
    'Location': it.loc,
    'VAT Type': it.vat,
    'SRP (Selling Price)': it.srp,
    'Delivery Cost': it.deliv,
    'Conversion': it.conv,
    'Case Value': it.cv
  }));
  const wsItems = XLSX.utils.json_to_sheet(itemsRows);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Item Master');

  // Shift Entries Sheet
  const shiftRows = (state.rows || []).map(r => ({
    'Line #': r.no,
    'Date': r.date,
    'Location': r.loc,
    'Shift': r.fr,
    'Beginning Inv': r.beg,
    'Delivery': r.del,
    'Doc / Ref #': r.doc || '',
    'Withdrawal': r.wd,
    'Transfer From': r.tf,
    'Transfer From Loc': r.tfl || '',
    'Transfer To': r.tt,
    'Transfer To Loc': r.ttl || '',
    'Spoilage / Bad': r.bad,
    'Ending Balance': r.end
  }));
  const wsRows = XLSX.utils.json_to_sheet(shiftRows);
  XLSX.utils.book_append_sheet(wb, wsRows, 'Shift Entries');

  // Audit Logs Sheet
  if (state.log && state.log.length > 0) {
    const logRows = state.log.map(l => ({
      'Timestamp': l.t,
      'User': l.u,
      'Tab / Area': l.tab,
      'Action': l.act,
      'Description': l.desc,
      'Date': l.date || '',
      'Location': l.loc || ''
    }));
    const wsLog = XLSX.utils.json_to_sheet(logRows);
    XLSX.utils.book_append_sheet(wb, wsLog, 'Audit History');
  }

  const wbOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(wbOut);
}

/**
 * Uploads a text/JSON file to Google Drive using multipart upload
 */
async function uploadMultipartFile(
  token: string,
  filename: string,
  content: string,
  mimeType: string,
  folderId?: string
): Promise<DriveFile> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata: Record<string, any> = {
    name: filename,
    mimeType: mimeType
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    closeDelim;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    throw new Error(`Google Drive Upload Error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as DriveFile;
}

/**
 * Uploads a binary buffer to Google Drive using multipart upload
 */
async function uploadMultipartBinary(
  token: string,
  filename: string,
  buffer: Uint8Array,
  mimeType: string,
  folderId?: string
): Promise<DriveFile> {
  const metadata: Record<string, any> = {
    name: filename,
    mimeType: mimeType
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', new Blob([buffer.buffer as ArrayBuffer], { type: mimeType }));

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,iconLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    }
  );

  if (!res.ok) {
    throw new Error(`Google Drive Binary Upload Error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as DriveFile;
}

/**
 * Downloads a text/JSON file's content from Google Drive
 */
export async function downloadDriveFileContent(token: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive (${res.status})`);
  }

  return await res.text();
}

/**
 * Deletes a file from Google Drive
 */
export async function deleteDriveFile(token: string, fileId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return res.ok || res.status === 204;
}
