export type UploadMetaFnParams = {
  readonly name: string,
  readonly branch: string,
}

export type UploadDataFnParams = {
  readonly type: 'data' | 'file',
  readonly name: string,
  readonly car: string,
  readonly size: string
}

export type DownloadFnParamTypes = 'data' | 'file'

export type DownloadDataFnParams = {
  readonly type: DownloadFnParamTypes,
  readonly name: string,
  readonly car: string,
}

export type DownloadMetaFnParams = {
  readonly name: string,
  readonly branch: string,
}

export interface DBConnection {
  connect(): Promise<void>
}

export interface Store<IType, KType> {
  start(): Promise<Store<IType, KType>>
  insert(ose: IType): Promise<RunResult>
  select(car: KType): Promise<RunResult>
}