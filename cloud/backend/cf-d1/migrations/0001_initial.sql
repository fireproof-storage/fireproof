-- Fireproof Cloud Backend D1 Schema
-- Run this to initialize the local D1 database

-- Tenant table
CREATE TABLE IF NOT EXISTS Tenant(
  tenant TEXT NOT NULL PRIMARY KEY,
  createdAt TEXT NOT NULL
);

-- TenantLedger table
CREATE TABLE IF NOT EXISTS TenantLedger(
  tenant TEXT NOT NULL,
  ledger TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY(tenant, ledger),
  FOREIGN KEY(tenant) REFERENCES Tenant(tenant)
);

-- KeyByTenantLedger table
CREATE TABLE IF NOT EXISTS KeyByTenantLedger(
  tenant TEXT NOT NULL,
  ledger TEXT NOT NULL,
  key TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (tenant, ledger, key),
  FOREIGN KEY (tenant, ledger) REFERENCES TenantLedger(tenant, ledger)
);

-- MetaByTenantLedger table
CREATE TABLE IF NOT EXISTS MetaByTenantLedger(
  tenant TEXT NOT NULL,
  ledger TEXT NOT NULL,
  metaCID TEXT NOT NULL,
  meta TEXT NOT NULL,
  reqId TEXT NOT NULL,
  resId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (tenant, ledger, metaCID),
  FOREIGN KEY (tenant, ledger) REFERENCES TenantLedger(tenant, ledger)
);

-- Index on MetaByTenantLedger for reqId/resId lookups
CREATE INDEX IF NOT EXISTS "MetaByTenantLedger-ReqIdResId" ON MetaByTenantLedger(tenant, ledger, reqId, resId);

-- MetaSend table
CREATE TABLE IF NOT EXISTS MetaSend(
  metaCID TEXT NOT NULL,
  tenant TEXT NOT NULL,
  ledger TEXT NOT NULL,
  reqId TEXT NOT NULL,
  resId TEXT NOT NULL,
  sendAt TEXT NOT NULL,
  PRIMARY KEY(metaCID, tenant, ledger, reqId, resId),
  FOREIGN KEY(tenant, ledger, metaCID) REFERENCES MetaByTenantLedger(tenant, ledger, metaCID)
);
