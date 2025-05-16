import { DocFileMeta } from "@fireproof/core";
import React, { useState, useEffect, useRef, useMemo, ImgHTMLAttributes } from "react";

// Union type to support both direct File objects and metadata objects
type FileType = File | DocFileMeta;

interface ImgFileProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  file?: FileType;
  /**
   * @deprecated Use 'file' instead. This is for internal use only to support legacy code.
   * @internal
   */
  meta?: FileType;
}

// Helper function to determine if the object is a File-like object
function isFile(obj: FileType): obj is File {
  return "type" in obj && "size" in obj && "stream" in obj && typeof obj.stream === "function";
}

// Helper function to determine if the object is a DocFileMeta
function isFileMeta(obj: FileType): obj is DocFileMeta {
  return "type" in obj && "size" in obj && "file" in obj && typeof obj.file === "function";
}

export function ImgFile({ file, meta, ...imgProps }: ImgFileProps) {
  const [imgDataUrl, setImgDataUrl] = useState("");
  const fileDataRef = useRef<FileType | null>(null);

  // Use meta as fallback if file is not provided (for backward compatibility)
  // Memoize fileData to prevent unnecessary re-renders
  const fileData = useMemo(() => {
    const data = file || meta;
    // If no data is provided, return null
    if (!data) {
      fileDataRef.current = null;
      return null;
    }

    // Only update the reference if the file actually changed
    if (
      !fileDataRef.current ||
      (isFile(data) &&
        isFile(fileDataRef.current) &&
        (data.size !== fileDataRef.current.size || data.lastModified !== fileDataRef.current.lastModified)) ||
      (isFileMeta(data) && isFileMeta(fileDataRef.current) && data !== fileDataRef.current)
    ) {
      fileDataRef.current = data;
    }
    return fileDataRef.current;
  }, [file, meta]);

  useEffect(() => {
    if (!fileData) return;

    const loadFile = async () => {
      let fileObj: File | null = null;
      let fileType = "";

      switch (true) {
        case isFile(fileData):
          fileObj = fileData;
          fileType = fileData.type;
          break;
        case isFileMeta(fileData):
          fileType = fileData.type;
          fileObj = (await fileData.file?.()) || null;
          break;
      }

      if (fileObj && /image/.test(fileType)) {
        // eslint-disable-next-line no-restricted-globals
        const src = URL.createObjectURL(fileObj);
        setImgDataUrl(src);
        // eslint-disable-next-line no-restricted-globals
        return () => URL.revokeObjectURL(src);
      }
    };

    let isMounted = true;
    let cleanup: (() => void) | undefined;

    loadFile().then((result) => {
      if (isMounted) {
        cleanup = result;
      } else if (result) {
        result();
      }
    });

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
    };
  }, [fileDataRef.current]);

  return imgDataUrl
    ? React.createElement("img", {
        src: imgDataUrl,
        ...imgProps,
      })
    : null;
}

export default ImgFile;
