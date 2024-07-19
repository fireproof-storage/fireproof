export interface UploadMetaFnParams {
  name: string;
  branch: string;
}

export interface UploadDataFnParams {
  type: "data" | "file";
  name: string;
  car: string;
  size: string;
}

export type DownloadFnParamTypes = "data" | "file";

export interface DownloadDataFnParams {
  type: DownloadFnParamTypes;
  name: string;
  car: string;
}

export interface DownloadMetaFnParams {
  name: string;
  branch: string;
}
