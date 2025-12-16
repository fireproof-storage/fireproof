import { Queryable, QueryUser } from "@fireproof/core-protocols-dashboard";
import { eq, or } from "drizzle-orm/sql/expressions";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";

export function toUndef(v: string | null | undefined): string | undefined {
  return v ? v : undefined;
}

export function toBoolean(v: number): boolean {
  return !!v;
}

export function queryable2QueryUser(queryable: Queryable): QueryUser {
  return {
    existingUserId: queryable.userId,
    byEmail: queryable.queryEmail,
    byNick: queryable.queryNick,
    andProvider: queryable.queryProvider,
  };
}

export function queryCondition(
  query: QueryUser,
  table: {
    readonly userId: SQLiteColumn;
    readonly queryEmail: SQLiteColumn;
    readonly queryNick: SQLiteColumn;
    readonly queryProvider: SQLiteColumn;
  },
) {
  // Build conditions for matching by userId, email, or nick
  // We OR together all possible matches so invites can be found by email even when userId is provided
  const conditions = [] as ReturnType<typeof or>[];

  if (query.existingUserId) {
    conditions.push(eq(table.userId, query.existingUserId));
  }

  const str = query.byString?.trim();
  if (str) {
    const byEmail = queryEmail(str);
    const byNick = queryNick(str);
    if (byEmail) {
      conditions.push(eq(table.queryEmail, byEmail));
    }
    if (byNick) {
      conditions.push(eq(table.queryNick, byNick));
    }
    conditions.push(eq(table.userId, str));
  }

  const byEmail = queryEmail(query.byEmail);
  const byNick = queryNick(query.byNick);
  if (byEmail) {
    conditions.push(eq(table.queryEmail, byEmail));
  }
  if (byNick) {
    conditions.push(eq(table.queryNick, byNick));
  }

  if (conditions.length === 0) {
    // No valid conditions - return a condition that matches nothing
    return eq(table.userId, Math.random() + "");
  }

  return or(...conditions);
}

export function queryNick(nick?: string): string | undefined {
  if (!nick) {
    return undefined;
  }
  nick = nick.trim().toLowerCase();
  return nick === "" ? undefined : nick;
}

export function queryEmail(email?: string): string | undefined {
  if (!email) {
    return undefined;
  }
  email = email.trim().toLowerCase();
  const splitEmail = email.match(/([^@]+)@(.*)$/);
  if (!splitEmail) {
    return undefined;
  }
  const splitPlus = splitEmail[1].match(/(.*)\+[^+]*$/);
  if (!splitPlus) {
    return splitEmail[1].replace(/[^a-z0-9]/g, "") + "@" + splitEmail[2];
  }
  return splitPlus[1].replace(/[^a-z0-9]/g, "") + "@" + splitEmail[2];
}
