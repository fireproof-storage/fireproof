import {
  CarClockHead,
  Connection,
  DbMetaEventBlock,
  DownloadDataFnParams,
  DownloadMetaFnParams,
  UploadDataFnParams,
  UploadMetaFnParams,
} from "../../storage-engine";
import { Client } from "@web3-storage/w3up-client";
import * as w3clock from "@web3-storage/clock/client";
import { decodeEventBlock } from "@web3-storage/pail/clock";
import { DID, Link, Proof } from "@ucanto/interface";
import { create as createClient } from "@web3-storage/w3up-client";
import * as Account from "@web3-storage/w3up-client/account";
import * as Result from "@web3-storage/w3up-client/result";
import { Falsy, throwFalsy } from "../../types";

export interface ConnectUCANParams {
  name: string;
  schema: string;
}

const DEFAULT_CLOCK_SPACE_NAME = "_fireproof_account";

function findClockSpace(client: Client, name: string = DEFAULT_CLOCK_SPACE_NAME): DID | Falsy {
  const spaces = client.spaces();
  const space = spaces
    // sort alphanumerically by space DID
    .sort((s, t) => (s.did() === t.did() ? 0 : s.did() < t.did() ? -1 : 1))
    // find the first one matching name
    .find((s) => s.name === name);
  return space?.did();
}

async function createSpace(client: Client, account: Account.Account, name: string = DEFAULT_CLOCK_SPACE_NAME): Promise<DID> {
  const space = await client.createSpace(name);
  Result.try(await account.provision(space.did()));
  await client.addSpace(
    await space.createAuthorization(client.agent, {
      access: { "*": {} },
      expiration: Infinity,
    }),
  );
  const recovery = await space.createRecovery(account.did());
  Result.try(
    await client.capability.access.delegate({
      space: space.did(),
      delegations: [recovery],
    }),
  );
  Result.try(await account.save());
  return space.did();
}

function parseEmail(email: string): Account.EmailAddress {
  if (email.split("@").length !== 2) {
    throw new Error(`${email} doesn't look anything like an email address, try again?`);
  }
  return email as Account.EmailAddress;
}

export class ConnectUCAN extends Connection {
  client?: Client;
  clockSpaceDID?: DID;
  readonly params: ConnectUCANParams;
  readonly pubsub: () => void;

  constructor(params: ConnectUCANParams) {
    super();
    this.params = params;
    this.pubsub = function () { return };
  }

  async authorize(rawEmail: string) {
    const email = parseEmail(rawEmail);
    const client = await createClient();
    this.client = client;
    const account = Result.try(await Account.login(client, email));
    Result.try(await account.save());
    const existingClockSpace = findClockSpace(client, this.params.name);
    if (existingClockSpace) {
      console.log(`Found ${existingClockSpace}, joining.`);
      this.clockSpaceDID = existingClockSpace;
    } else {
      this.clockSpaceDID = await createSpace(client, account, this.params.name);
      console.log("Could not find existing space, creating new one.");
    }
    await client.setCurrentSpace(throwFalsy(this.clockSpaceDID));
    console.log("starting background sync");
    void this.startBackgroundSync();
  }

  async startBackgroundSync() {
    while (true) {
      await new Promise((resolve) =>
        // todo implement websocket on w3clock
        setTimeout(resolve, 1500),
      );
      try {
        console.log("refreshing");
        await this.refresh();
        console.log("refreshed");
      } catch (e: unknown) {
        console.log("refresh error", e);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  async dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy> {
    const url = `https://${params.car}.ipfs.w3s.link/`;
    const response = await fetch(url);
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    } else {
      throw new Error(`Failed to download ${url}`);
    }
  }

  async dataUpload(
    bytes: Uint8Array,
    params: UploadDataFnParams,
    opts?: { public?: boolean },
  ): Promise<void> {
    const client = this.client;
    if (!client) {
      throw new Error("client not initialized, cannot dataUpload, please authorize first");
    }

    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    if (params.type === "file" && opts?.public) {
      await client.uploadCAR(new Blob([bytes]));
    }
    return await client.uploadFile(new Blob([bytes])).then(() => {
      return;
    });
  }

  async metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy> {
    const client = this.client;
    if (!client) {
      throw new Error("client not initialized, cannot metaDownload, please authorize first");
    }
    const clockSpaceDID = this.clockSpaceDID;
    if (!clockSpaceDID) {
      throw new Error("clockSpaceDID not initialized, cannot metaDownload, please authorize first");
    }
    if (params.branch !== "main") {
      throw new Error("todo, implement space per branch");
    }
    const clockProofs = await this.clockProofsForDb();
    const head = await w3clock.head({
      issuer: client.agent.issuer,
      with: clockSpaceDID,
      proofs: clockProofs,
    });
    if (head.out.ok) {
      return this.fetchAndUpdateHead(head.out.ok.head as unknown as Link<DbMetaEventBlock, number, number, 1>[]);
    } else {
      console.log("w3clock error", head.out.error);
      throw new Error(`Failed to download ${params.name}`);
    }
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | undefined> {
    const client = this.client;
    if (!client) {
      throw new Error("client not initialized, cannot metaUpload, please authorize first");
    }
    const clockSpaceDID = this.clockSpaceDID;
    if (!clockSpaceDID) {
      throw new Error("clockSpaceDID not initialized, cannot metaUpload, please authorize first");
    }
    if (params.branch !== "main") {
      throw new Error("todo, implement space per branch");
    }

    const clockProofs = await this.clockProofsForDb();

    const event = await this.createEventBlock(bytes);

    // TODO: turn event into a CAR rather than a blob and use uploadCAR below
    const blob = new Blob([event.bytes]);

    await client.uploadFile(blob);

    const blocks = [];
    for (const { bytes: eventBytes } of this.eventBlocks.entries()) {
      blocks.push(await decodeEventBlock(eventBytes));
    }

    const advanced = await w3clock.advance(
      {
        issuer: client.agent.issuer,
        with: clockSpaceDID,

        proofs: clockProofs,
      },
      event.cid,
      { blocks },
    );

    const { ok, error } = throwFalsy(advanced.root.data).ocm.out;
    if (error) {
      throw new Error(JSON.stringify(error));
    }
    this.parents = [event.cid];

    const head = ok.head as CarClockHead;
    return this.fetchAndUpdateHead(head);
  }

  async fetchAndUpdateHead(remoteHead: CarClockHead) {
    const outBytess = [];
    const cache = this.eventBlocks;
    for (const cid of remoteHead) {
      const local = await cache.get(cid);
      if (local) {
        const event = await decodeEventBlock(local.bytes);
        outBytess.push(event.value.data.dbMeta as Uint8Array);
      } else {
        const url = `https://${cid.toString()}.ipfs.w3s.link/`;
        const response = await fetch(url, { redirect: "follow" });
        if (response.ok) {
          const metaBlock = new Uint8Array(await response.arrayBuffer());
          await cache.put(cid, metaBlock);
          const event = await decodeEventBlock(metaBlock);
          outBytess.push(event.value.data.dbMeta as Uint8Array);
        } else {
          throw new Error(`Failed to download ${url}`);
        }
      }
    }
    this.parents = remoteHead;
    return outBytess;
  }

  async clockProofsForDb(): Promise<Proof[]> {
    const client = this.client;
    if (!client) {
      throw new Error("client not initialized, cannot get clock proofs, please authorize first");
    }
    const clockSpaceDID = this.clockSpaceDID;
    if (!clockSpaceDID) {
      throw new Error("clockSpaceDID not initialized, cannot get clock proofs, please authorize first");
    }
    const clockProofs = client.proofs([{ can: "clock/*", with: clockSpaceDID }]);
    if (!clockProofs.length) {
      throw new Error("missing clock/* capability on account space");
    }
    return clockProofs;
  }
}
