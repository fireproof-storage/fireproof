import { Database } from 'better-sqlite3';
import { DBConnection } from './types';



export class SQLiteConnection implements DBConnection {
    static fromFilename(filename: string): DBConnection {
        return new SQLiteConnection(filename)
    }
    readonly filename: string
    client?: Database
    private constructor(filename: string) {
        console.log('sqlite constructor', filename);
        this.filename = filename
    }
    async connect(): Promise<void> {
        console.log('sqlite connect');
        const Sqlite3Database = (await import('better-sqlite3')).default;
        this.client = new Sqlite3Database(this.filename, {
            // verbose: console.log,
            nativeBinding: "./node_modules/better-sqlite3/build/Release/better_sqlite3.node"
        });
    }
    async close(): Promise<void> {
        this.client?.close()
    }
}
