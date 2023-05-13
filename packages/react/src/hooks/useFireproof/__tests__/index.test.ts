import { TextEncoder, TextDecoder } from 'util';
import randomBytes from 'randombytes';

const crypto = {
  getRandomValues: (arr: any) => randomBytes(arr.length),
};

Object.assign(global, { TextDecoder, TextEncoder, crypto });

import { useFireproof } from '../index';
import { expect, describe, it } from '@jest/globals';
// import { Database } from '@fireproof/core';
const hooklib = require('@testing-library/react-hooks');
const { renderHook, act } = hooklib;

describe('useFireproof tests', () => {
  it('should be defined', () => {
    expect(useFireproof).toBeDefined();
  });

  it('renders the hook correctly and checks types', () => {
    renderHook(() => {
      const { database, useLiveQuery, useLiveDocument } = useFireproof('dbname');
      // console.log('useFireproof', database, useLiveQuery, useLiveDocument);
      expect(typeof useLiveQuery).toBe('function');
      expect(typeof useLiveDocument).toBe('function');
      expect(database?.constructor.name).toBe('Database');
    });
  });

  it('should update livequery', async () => {
    // let db: Database;
    const res = renderHook(() => {
      const { database, useLiveQuery } = useFireproof();
      if (database) {
        // db = database;
      }
      return useLiveQuery((doc: any) => doc.good);
    });
    console.log('res', res.result.current);

    await act(async () => {
      // await db.put({ _id: '1', good: true });
    });
    expect(res.rows.length).toBe(1);
  });
});
