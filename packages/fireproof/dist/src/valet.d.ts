export class Valet {
    constructor(name: string, keyMaterial: any);
    idb: any;
    name: any;
    uploadQueue: any;
    alreadyEnqueued: Set<any>;
    keyMaterial: any;
    keyId: string;
    /**
     * Function installed by the database to upload car files
     * @type {null|function(string, Uint8Array):Promise<void>}
     */
    uploadFunction: null | ((arg0: string, arg1: Uint8Array) => Promise<void>);
    getKeyMaterial(): any;
    setKeyMaterial(km: any): void;
    /**
     * Group the blocks into a car and write it to the valet.
     * @param {InnerBlockstore} innerBlockstore
     * @param {Set<string>} cids
     * @returns {Promise<void>}
     * @memberof Valet
     */
    writeTransaction(innerBlockstore: InnerBlockstore, cids: Set<string>): Promise<void>;
    withDB: (dbWorkFun: any) => Promise<any>;
    /**
     *
     * @param {string} carCid
     * @param {*} value
     */
    parkCar(carCid: string, value: any, cids: any): Promise<void>;
    remoteBlockFunction: any;
    getBlock(dataCID: any): Promise<any>;
}
//# sourceMappingURL=valet.d.ts.map