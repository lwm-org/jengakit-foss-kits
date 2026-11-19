import Dexie, { Table } from 'dexie';

export interface Bookmark {
  id?: number;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  timestamp: number;
}

export interface Settings {
  id?: number;
  fontSize: number;
  theme: 'light' | 'dark';
  lastBook: string;
  lastChapter: number;
  ownerName: string;
}

export class BibleDatabase extends Dexie {
  bookmarks!: Table<Bookmark>;
  settings!: Table<Settings>;

  constructor() {
    super('BibleDatabase');
    this.version(2).stores({
      bookmarks: '++id, [book+chapter+verse], timestamp',
      settings: '++id'
    });
  }
}

export const db = new BibleDatabase();
