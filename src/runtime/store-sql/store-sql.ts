import { Logger, Result } from "@adviser/cement";

import { TestStore } from "../../blockstore/types.js";
import { SQLConnectionFactory } from "./sql-connection-factory.js";
import { DataSQLStore, MetaSQLStore, WalSQLStore } from "./types.js";
import { DataStoreFactory, MetaStoreFactory, WalStoreFactory } from "./store-version-factory.js";
import { ensureLogger, exception2Result, exceptionWrapper, getKey, getName } from "../../utils.js";
import { Gateway, GetResult, NotFoundError } from "../../blockstore/gateway.js";

export class SQLWalGateway implements Gateway {
  readonly logger: Logger;
  walSQLStore: WalSQLStore = {} as WalSQLStore;
  constructor(logger: Logger) {
    this.logger = ensureLogger(logger, "SQLWalGateway");
  }

  buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    url.searchParams.set("key", key);
    return Promise.resolve(Result.Ok(url));
  }

  async start(baseUrl: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this.logger.Debug().Url(baseUrl).Msg("start");
      const conn = SQLConnectionFactory(baseUrl);
      const ws = await WalStoreFactory(conn);
      await ws.start(baseUrl);
      this.walSQLStore = ws;
    });
  }
  close(baseUrl: URL) {
    return this.walSQLStore.close(baseUrl);
  }
  destroy(baseUrl: URL) {
    return this.walSQLStore.destroy(baseUrl);
  }

  async put(url: URL, body: Uint8Array): Promise<Result<void>> {
    return exception2Result(async () => {
      const branch = getKey(url, this.logger);
      const name = getName(url, this.logger);
      await this.walSQLStore.insert(url, {
        state: body,
        updated_at: new Date(),
        name,
        branch,
      });
    });
  }
  async get(url: URL): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const branch = getKey(url, this.logger);
      const name = getName(url, this.logger);
      const record = await this.walSQLStore.select(url, { name, branch });
      if (record.length === 0) {
        return Result.Err(new NotFoundError(`not found ${name} ${branch}`));
      }
      return Result.Ok(record[0].state);
    });
  }
  async delete(url: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      const branch = getKey(url, this.logger);
      const name = getName(url, this.logger);
      await this.walSQLStore.delete(url, { name, branch });
    });
  }
}

export class SQLMetaGateway implements Gateway {
  readonly logger: Logger;
  metaSQLStore: MetaSQLStore = {} as MetaSQLStore;
  constructor(logger: Logger) {
    this.logger = ensureLogger(logger, "SQLMetaGateway");
  }

  buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    url.searchParams.set("key", key);
    return Promise.resolve(Result.Ok(url));
  }

  async start(baseUrl: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this.logger.Debug().Url(baseUrl).Msg("start");
      const conn = SQLConnectionFactory(baseUrl);
      const ws = await MetaStoreFactory(conn);
      await ws.start(baseUrl);
      this.metaSQLStore = ws;
      this.logger.Debug().Url(baseUrl).Msg("started");
    });
  }
  close(baseUrl: URL): Promise<Result<void>> {
    return this.metaSQLStore.close(baseUrl);
  }
  destroy(baseUrl: URL): Promise<Result<void>> {
    return this.metaSQLStore.destroy(baseUrl);
  }

  async put(url: URL, body: Uint8Array): Promise<Result<void>> {
    return exception2Result(async () => {
      const branch = getKey(url, this.logger);
      const name = getName(url, this.logger);
      await this.metaSQLStore.insert(url, {
        meta: body,
        updated_at: new Date(),
        name,
        branch,
      });
    });
  }
  async get(url: URL): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const branch = getKey(url, this.logger);
      const name = getName(url, this.logger);
      const record = await this.metaSQLStore.select(url, {
        name,
        branch,
      });
      if (record.length === 0) {
        return Result.Err(new NotFoundError(`not found ${name} ${branch}`));
      }
      return Result.Ok(record[0].meta);
    });
  }
  async delete(url: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      const branch = getKey(url, this.logger);
      const name = getName(url, this.logger);
      await this.metaSQLStore.delete(url, {
        name,
        branch,
      });
    });
  }
}

export class SQLDataGateway implements Gateway {
  readonly logger: Logger;
  dataSQLStore: DataSQLStore = {} as DataSQLStore;
  constructor(logger: Logger) {
    this.logger = ensureLogger(logger, "SQLDataGateway");
  }

  buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    url.searchParams.set("key", key);
    return Promise.resolve(Result.Ok(url));
  }

  async start(baseUrl: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this.logger.Debug().Url(baseUrl).Msg("pre-sql-connection");
      const conn = SQLConnectionFactory(baseUrl);
      this.logger.Debug().Url(baseUrl).Msg("post-sql-connection");
      const ws = await DataStoreFactory(conn);
      this.logger.Debug().Url(baseUrl).Msg("post-data-store-factory");
      await ws.start(baseUrl);
      this.dataSQLStore = ws;
      this.logger.Debug().Url(baseUrl).Msg("started");
    });
  }
  close(baseUrl: URL): Promise<Result<void>> {
    return this.dataSQLStore.close(baseUrl);
  }
  destroy(baseUrl: URL): Promise<Result<void>> {
    return this.dataSQLStore.destroy(baseUrl);
  }

  async put(url: URL, body: Uint8Array): Promise<Result<void>> {
    return exception2Result(async () => {
      const cid = getKey(url, this.logger);
      const name = getName(url, this.logger);
      await this.dataSQLStore.insert(url, {
        data: body,
        updated_at: new Date(),
        name: name,
        car: cid,
      });
    });
  }
  async get(url: URL): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const branch = getKey(url, this.logger);
      const record = await this.dataSQLStore.select(url, branch);
      if (record.length === 0) {
        return Result.Err(new NotFoundError(`not found ${branch}`));
      }
      return Result.Ok(record[0].data);
    });
  }
  async delete(url: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      const branch = getKey(url, this.logger);
      await this.dataSQLStore.delete(url, branch);
      return Result.Ok(undefined);
    });
  }
}

export class SQLTestStore implements TestStore {
  readonly url: URL;
  readonly logger: Logger;
  constructor(url: URL, ilogger: Logger) {
    const logger = ensureLogger(ilogger, "SQLTestStore", { url });
    this.url = url;
    this.logger = logger;
  }
  async get(key: string): Promise<Uint8Array> {
    const conn = SQLConnectionFactory(this.url);
    const name = getName(this.url, this.logger);
    switch (this.url.searchParams.get("store")) {
      case "wal": {
        const sqlStore = await WalStoreFactory(conn);
        await sqlStore.start(this.url);
        const records = await sqlStore.select(this.url, {
          name,
          branch: key,
        });
        return records[0].state;
      }
      case "meta": {
        const sqlStore = await MetaStoreFactory(conn);
        await sqlStore.start(this.url);
        const records = await sqlStore.select(this.url, {
          name,
          branch: key,
        });
        return records[0].meta;
      }
      case "data": {
        const sqlStore = await DataStoreFactory(conn);
        await sqlStore.start(this.url);
        const records = await sqlStore.select(this.url, key);
        return records[0].data;
      }
      default:
        throw this.logger.Error().Str("key", key).Msg(`Method not implemented`);
    }
  }
}
