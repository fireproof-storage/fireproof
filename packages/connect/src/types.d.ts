export type UploadMetaFnParams = {
  name: string
  branch: string
}

export type UploadDataFnParams = {
  type: 'data' | 'file'
  name: string
  car: string
  size: string
}

export type DownloadFnParamTypes = 'data' | 'file'

export type DownloadDataFnParams = {
  type: DownloadFnParamTypes
  name: string
  car: string
}

export type DownloadMetaFnParams = {
  name: string
  branch: string
}
