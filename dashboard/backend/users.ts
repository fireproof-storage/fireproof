import { Result } from "@adviser/cement";
import { ps } from "@fireproof/core";
import { int, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { queryCondition, toUndef } from "./sql-helper.ts";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { eq, and, inArray } from "drizzle-orm/expressions";

type QueryUser = ps.dashboard.QueryUser;
type User = ps.dashboard.User;
type UserStatus = ps.dashboard.UserStatus;
type AuthProvider = ps.dashboard.AuthProvider;
type UserByProvider = ps.dashboard.UserByProvider;

export const sqlUsers = sqliteTable("Users", {
  userId: text().primaryKey(),
  // max number of tenants
  maxTenants: int().notNull().default(5),
  // status
  status: text().notNull().default("active"), // "active" | "inactive" | "banned"
  // statusReason
  statusReason: text(),
  // iso date string
  createdAt: text().notNull(),
  // iso date string
  updatedAt: text().notNull(),
});

export const sqlUserByProviders = sqliteTable(
  "UserByProviders",
  {
    userId: text()
      .notNull()
      .references(() => sqlUsers.userId),
    // userId from auth provider
    providerUserId: text().notNull().unique(),
    // name of auth provider
    queryProvider: text().notNull(),
    // email key for QueryUser -> tolower - remove + and .
    queryEmail: text(),
    // original email
    cleanEmail: text(),
    // nick key for QueryUser -> tolower
    queryNick: text(),
    // original nick
    cleanNick: text(),
    // json/jwt from auth provider
    params: text().notNull(),
    // last used date
    used: text().notNull(),
    // iso date string
    createdAt: text().notNull(),
    // iso date string
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.providerUserId] }),
    index("queryEmailIdx").on(table.queryEmail),
    index("queryNickIdx").on(table.queryNick),
  ],
);

export async function queryUser(db: LibSQLDatabase, req: QueryUser): Promise<Result<User[]>> {
  const condition = queryCondition(req, sqlUserByProviders);
  if (!condition) {
    return Result.Err("invalid query");
  }
  return getUsers(db, [condition]);
}

export async function getUsers(db: LibSQLDatabase, condition: ReturnType<typeof and>[]) {
  const rows = await db
    .select()
    .from(sqlUserByProviders)
    .innerJoin(sqlUsers, eq(sqlUsers.userId, sqlUserByProviders.userId))
    .where(and(...condition))
    .all();
  return Result.Ok(sqlToUser(rows));
}

export async function getUser(db: LibSQLDatabase, authUserId: string): Promise<Result<User>> {
  const rRows = await getUsers(db, [inArray(sqlUsers.status, ["active"]), eq(sqlUserByProviders.providerUserId, authUserId)]);
  if (rRows.isErr()) {
    return Result.Err(rRows.Err());
  }
  if (rRows.Ok().length !== 1) {
    return Result.Err(new UserNotFoundError());
  }
  return Result.Ok(rRows.Ok()[0]);
}

function sqlToUser(
  sql: {
    Users: typeof sqlUsers.$inferSelect;
    UserByProviders: typeof sqlUserByProviders.$inferSelect;
  }[],
): User[] {
  const map = new Map<string, User>();
  for (const row of sql) {
    const key = row.Users.userId;
    let item = map.get(key);
    if (!item) {
      item = {
        userId: key,
        maxTenants: row.Users.maxTenants,
        status: row.Users.status as UserStatus,
        statusReason: toUndef(row.Users.statusReason),
        createdAt: new Date(row.Users.createdAt),
        updatedAt: new Date(row.Users.updatedAt),
        byProviders: [],
      };
      map.set(key, item);
    }
    item.byProviders.push({
      providerUserId: row.UserByProviders.providerUserId,
      queryProvider: row.UserByProviders.queryProvider as AuthProvider,
      queryEmail: toUndef(row.UserByProviders.queryEmail),
      cleanEmail: toUndef(row.UserByProviders.cleanEmail),
      queryNick: toUndef(row.UserByProviders.queryNick),
      cleanNick: toUndef(row.UserByProviders.cleanNick),
      params: JSON.parse(row.UserByProviders.params),
      used: new Date(row.UserByProviders.used),
      createdAt: new Date(row.UserByProviders.createdAt),
      updatedAt: new Date(row.UserByProviders.updatedAt),
    });
  }
  const result = Array.from(map.values());
  return result;
}

function upsetUsers(db: LibSQLDatabase, req: UserWithoutDate, now = new Date()) {
  return db
    .insert(sqlUsers)
    .values(prepareInsertUsers(req, now))
    .onConflictDoUpdate({
      target: [sqlUsers.userId],
      set: {
        maxTenants: req.maxTenants,
        status: req.status,
        statusReason: req.statusReason,
        updatedAt: now.toISOString(),
      },
    })
    .run();
}

export type UserByProviderWithoutDate = Omit<Omit<Omit<UserByProvider, "used">, "createdAt">, "updatedAt"> & {
  readonly used?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};

export type UserWithoutDate = Omit<Omit<Omit<User, "byProviders">, "createdAt">, "updatedAt"> & {
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly byProviders: UserByProviderWithoutDate[];
};

export async function upsetUserByProvider(db: LibSQLDatabase, req: UserWithoutDate, now = new Date()) {
  await upsetUsers(db, req, now);
  for (const byProvider of req.byProviders) {
    await db
      .insert(sqlUserByProviders)
      .values({
        userId: req.userId,
        providerUserId: byProvider.providerUserId,
        queryProvider: byProvider.queryProvider,
        queryEmail: byProvider.queryEmail,
        cleanEmail: byProvider.cleanEmail,
        queryNick: byProvider.queryNick,
        cleanNick: byProvider.cleanNick,
        params: JSON.stringify(byProvider.params),
        used: (byProvider.used ?? now).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .onConflictDoUpdate({
        target: [sqlUserByProviders.userId, sqlUserByProviders.providerUserId],
        set: {
          queryProvider: byProvider.queryProvider,
          queryEmail: byProvider.queryEmail,
          cleanEmail: byProvider.cleanEmail,
          queryNick: byProvider.queryNick,
          cleanNick: byProvider.cleanNick,
          params: JSON.stringify(byProvider.params),
          used: (byProvider.used ?? now).toISOString(),
          updatedAt: now.toISOString(),
        },
      })
      .run();
  }
}

function prepareInsertUsers(req: UserWithoutDate, now = new Date()): typeof sqlUsers.$inferInsert {
  const user: typeof sqlUsers.$inferInsert = {
    userId: req.userId,
    maxTenants: req.maxTenants,
    status: req.status,
    statusReason: req.statusReason,
    createdAt: (req.createdAt ?? now).toISOString(),
    updatedAt: (req.updatedAt ?? req.createdAt ?? now).toISOString(),
  };
  return user;
}

export class UserNotFoundError extends Error {
  constructor() {
    super("user not found");
  }
}

export function isUserNotFound(ierr: Result<unknown> | Error): boolean {
  let err: Error;
  if (Result.Is(ierr)) {
    if (ierr.isOk()) {
      return false;
    }
    err = ierr.Err();
  } else {
    err = ierr;
  }
  return err instanceof UserNotFoundError;
}
