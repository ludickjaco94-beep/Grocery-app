import * as Sharing from 'expo-sharing';

import { exportBackup } from './backupRepo';

const mockWrite = jest.fn();
const mockText = jest.fn();

jest.mock('@/db/db', () => ({ db: { getAll: jest.fn(async () => []) } }));
jest.mock('@/db/schema', () => ({ AppSchema: { tables: [{ name: 'items', localOnly: false, columns: [{ name: 'name' }] }] } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri = 'file:///cache/backup.csv';
    create() {}
    write(text: string) {
      return mockWrite(text);
    }
    text() {
      return mockText();
    }
  },
}));

const now = new Date(2026, 10, 1);
let written = '';

beforeEach(() => {
  jest.clearAllMocks();
  written = '';
  mockWrite.mockImplementation(async (text: string) => {
    written = text;
  });
  mockText.mockImplementation(async () => written);
});

test('exportBackup waits for the write before sharing', async () => {
  let finishWrite = () => {};
  mockWrite.mockImplementation((text: string) => {
    written = text;
    return new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
  });
  const done = exportBackup(now);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  finishWrite();
  await done;
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});

test('exportBackup does not share after a failed write', async () => {
  mockWrite.mockRejectedValue(new Error('disk full'));
  await expect(exportBackup(now)).rejects.toThrow('disk full');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('exportBackup does not share a file that reads back differently', async () => {
  mockText.mockResolvedValue('');
  await expect(exportBackup(now)).rejects.toThrow('own check');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
