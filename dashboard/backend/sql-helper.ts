import { and, eq, isNull, or } from "drizzle-orm/expressions";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";

export function toUndef(v: string | null | undefined): string | undefined {
  return v ? v : undefined;
}

export function toBoolean(v: number): boolean {
  return !!v;
}

export type AuthProvider = "github" | "google" | "fp";

export interface Queryable {
  readonly userId?: string;
  readonly queryProvider?: AuthProvider;
  readonly queryEmail?: string;
  readonly queryNick?: string;
}

export interface QueryUser {
  readonly byString?: string; // could be email or nick or exact userId
  readonly existingUserId?: string;
  readonly byEmail?: string; // exact email
  readonly byNick?: string; // exact nick
  readonly andProvider?: AuthProvider;
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
  if (query.existingUserId) {
    return eq(table.userId, query.existingUserId);
  }

  const str = query.byString?.trim();
  if (str) {
    const byEmail = queryEmail(str);
    const byNick = queryNick(str);
    const conditions = [] as ReturnType<typeof or>[];
    if (byEmail) {
      conditions.push(eq(table.queryEmail, byEmail));
    }
    if (byNick) {
      conditions.push(eq(table.queryNick, byNick));
    }
    conditions.push(eq(table.userId, str));
    return or(...conditions);
  }

  const byEmail = queryEmail(query.byEmail);
  const byNick = queryNick(query.byNick);
  let where: ReturnType<typeof and> = eq(table.userId, Math.random() + "");
  if (byEmail && byNick && query.andProvider) {
    where = and(eq(table.queryEmail, byEmail), eq(table.queryNick, byNick), eq(table.queryProvider, query.andProvider));
  } else if (byEmail && byNick) {
    where = and(eq(table.queryEmail, byEmail), eq(table.queryNick, byNick));
  } else if (byEmail && query.andProvider) {
    where = and(eq(table.queryEmail, byEmail), eq(table.queryProvider, query.andProvider));
  } else if (byNick && query.andProvider) {
    where = and(eq(table.queryNick, byNick), eq(table.queryProvider, query.andProvider));
  } else if (byEmail) {
    where = eq(table.queryEmail, byEmail);
  } else if (byNick) {
    where = eq(table.queryNick, byNick);
  }
  return where;
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
  const splitPlus = splitEmail[1].match(/(.*)\+[^\+]*$/);
  if (!splitPlus) {
    return splitEmail[1].replace(/[^a-z0-9]/g, "") + "@" + splitEmail[2];
  }
  return splitPlus[1].replace(/[^a-z0-9]/g, "") + "@" + splitEmail[2];
}
