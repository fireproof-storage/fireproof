// import 'dotenv/config';
// import { drizzle } from 'drizzle-orm/libsql';
// import { createClient } from '@libsql/client';


//   return {
//     pk: primaryKey({ columns: [table.tenantId, table.userRefId] }),
//   };
// })

// const client = createClient({ url: process.env.DB_FILE_NAME! });
// const db = drizzle({ client });

export * from './users.ts'
export * from './tenants.ts'
export * from './ledgers.ts'
export * from './invites.ts'