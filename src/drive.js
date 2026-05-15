const FOLDER_NAME = 'HAP Milk Journal';
const ENTRIES_FILE = 'entries.json';
const EXPENSES_FILE = 'expenses.json';
const PAYMENTS_FILE = 'payments.json';

async function apiFetch(url, options = {}, token) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res.json();
}

export async function getOrCreateFolder(token) {
  const search = await apiFetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    {}, token
  );
  if (search.files && search.files.length > 0) return search.files[0].id;

  const created = await apiFetch(
    'https://www.googleapis.com/drive/v3/files',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    }, token
  );
  return created.id;
}

async function getFileId(token, folderId, fileName) {
  const search = await apiFetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&fields=files(id,name)`,
    {}, token
  );
  if (search.files && search.files.length > 0) return search.files[0].id;
  return null;
}

async function readFile(token, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

async function writeFile(token, folderId, fileName, data, existingId = null) {
  const content = JSON.stringify(data);
  const blob = new Blob([content], { type: 'application/json' });

  if (existingId) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: fileName })], { type: 'application/json' }));
    form.append('file', blob);
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
    form.append('file', blob);
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
  }
}

export async function loadData(token) {
  const folderId = await getOrCreateFolder(token);
  const entriesId = await getFileId(token, folderId, ENTRIES_FILE);
  const expensesId = await getFileId(token, folderId, EXPENSES_FILE);
  const paymentsId = await getFileId(token, folderId, PAYMENTS_FILE);
  const entries = entriesId ? (await readFile(token, entriesId)) || [] : [];
  const expenses = expensesId ? (await readFile(token, expensesId)) || [] : [];
  const payments = paymentsId ? (await readFile(token, paymentsId)) || [] : [];
  return { entries, expenses, payments, folderId };
}

export async function saveEntries(token, folderId, entries) {
  const existingId = await getFileId(token, folderId, ENTRIES_FILE);
  await writeFile(token, folderId, ENTRIES_FILE, entries, existingId);
}

export async function saveExpenses(token, folderId, expenses) {
  const existingId = await getFileId(token, folderId, EXPENSES_FILE);
  await writeFile(token, folderId, EXPENSES_FILE, expenses, existingId);
}

export async function savePayments(token, folderId, payments) {
  const existingId = await getFileId(token, folderId, PAYMENTS_FILE);
  await writeFile(token, folderId, PAYMENTS_FILE, payments, existingId);
}
