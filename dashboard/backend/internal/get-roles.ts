import { toRole, toReadWrite } from "@fireproof/core-types-protocols-cloud";
import { eq, and, inArray } from "drizzle-orm";
import { sqlLedgers, sqlLedgerUsers } from "../sql/ledgers.js";
import { sqlTenants, sqlTenantUsers } from "../sql/tenants.js";
import { FPApiSQLCtx } from "../types.js";
import { RoleType } from "@fireproof/core-types-protocols-dashboard";

export async function getRoles(
  { db }: FPApiSQLCtx,
  userId: string,
  tenants: (typeof sqlTenants.$inferSelect)[],
  ledgers: (typeof sqlLedgers.$inferSelect)[],
): Promise<RoleType[]> {
  if (!tenants.length && !ledgers.length) {
    throw new Error("tenant or ledger required");
  }
  // if (tenants && !tenants.length) {
  //   throw new Error("tenant not found");
  // }
  // if (ledgers && !ledgers.length) {
  //   throw new Error("ledger not found");
  // }

  // let myLedgerUsers: {
  //   Ledgers: typeof sqlLedgers.$inferSelect
  //   LedgerUsers: typeof sqlLedgerUsers.$inferSelect
  // }[] | undefined;
  let ledgerUsersFilter = new Map<
    string,
    {
      ledger: typeof sqlLedgers.$inferSelect;
      users: (typeof sqlLedgerUsers.$inferSelect)[];
      my?: typeof sqlLedgerUsers.$inferSelect;
    }
  >();
  if (ledgers.length) {
    const ledgerUsers = await db
      .select()
      .from(sqlLedgerUsers)
      .innerJoin(sqlLedgers, eq(sqlLedgerUsers.ledgerId, sqlLedgers.ledgerId))
      .where(
        and(
          inArray(
            sqlLedgerUsers.ledgerId,
            db
              .select({ ledgerId: sqlLedgerUsers.ledgerId })
              .from(sqlLedgerUsers)
              .where(
                and(
                  inArray(
                    sqlLedgerUsers.ledgerId,
                    ledgers.map((l) => l.ledgerId),
                  ),
                  eq(sqlLedgerUsers.userId, userId),
                ),
              ),
          ),
          eq(sqlLedgerUsers.status, "active"),
        ),
      )
      .all();
    const myLedgerUsers = ledgerUsers.filter((lu) => lu.LedgerUsers.userId === userId);
    if (!myLedgerUsers.length) {
      // throw new Error("user is not attached to ledger");
      return [];
    }
    ledgerUsersFilter = ledgerUsers.reduce((acc, lu) => {
      let item = acc.get(lu.Ledgers.ledgerId);
      if (!item) {
        item = {
          ledger: lu.Ledgers,
          users: [],
        };
        acc.set(lu.Ledgers.ledgerId, item);
      }
      if (lu.LedgerUsers.userId === userId) {
        item.my = lu.LedgerUsers;
      }
      item.users.push(lu.LedgerUsers);
      return acc;
    }, ledgerUsersFilter);
    // remove other users if you are not admin
    Array.from(ledgerUsersFilter.values()).forEach((item) => {
      item.users = item.users.filter((u) => item.my?.role === "admin" || (item.my?.role !== "admin" && u.userId === userId));
    });
  }
  const tenantIds = ledgers.length
    ? Array.from(ledgerUsersFilter.values()).map((lu) => lu.ledger.tenantId)
    : (tenants?.map((t) => t.tenantId) ?? []);

  const q = db
    .select()
    .from(sqlTenantUsers)
    .where(
      and(
        inArray(
          sqlTenantUsers.tenantId,
          db
            .select({ tenantId: sqlTenantUsers.tenantId })
            .from(sqlTenantUsers)
            .where(and(inArray(sqlTenantUsers.tenantId, tenantIds), eq(sqlTenantUsers.userId, userId))),
        ),
        eq(sqlTenantUsers.status, "active"),
      ),
    );

  const tenantUsers = await q.all();
  // console.log(">>>>>>", tenantUsers.toString());
  const tenantUserFilter = tenantUsers.reduce(
    (acc, lu) => {
      let item = acc.get(lu.tenantId);
      if (!item) {
        item = {
          users: [],
        };
        acc.set(lu.tenantId, item);
      }
      if (lu.userId === userId) {
        item.my = lu;
      }
      item.users.push(lu);
      return acc;
    },
    new Map<
      string,
      {
        users: (typeof sqlTenantUsers.$inferSelect)[];
        my?: typeof sqlTenantUsers.$inferSelect;
      }
    >(),
  );
  // remove other users if you are not admin
  Array.from(tenantUserFilter.values()).forEach((item) => {
    item.users = item.users.filter((u) => item.my?.role === "admin" || (item.my?.role !== "admin" && u.userId === userId));
  });

  return [
    ...Array.from(tenantUserFilter.values()).map((item) => ({
      userId: userId,
      tenantId: item.users[0].tenantId,
      role: toRole(item.my?.role),
      adminUserIds: item.users.filter((u) => u.role === "admin").map((u) => u.userId),
      memberUserIds: item.users.filter((u) => u.role !== "admin").map((u) => u.userId),
    })),
    ...Array.from(ledgerUsersFilter.values()).map((item) => ({
      userId: userId,
      ledgerId: item.ledger.ledgerId,
      role: toRole(item.my?.role),
      right: toReadWrite(item.my?.right),
      adminUserIds: item.users.filter((u) => u.role === "admin").map((u) => u.userId),
      memberUserIds: item.users.filter((u) => u.role !== "admin").map((u) => u.userId),
    })),
  ];
}
