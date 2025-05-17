import { DocFileMeta } from "@fireproof/core";
import React, { useState, useEffect, useRef, useMemo, ImgHTMLAttributes } from "react";

// Cache for object URLs to avoid recreating them unnecessarily
const objectUrlCache = new Map<string, string>();

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
  const fileObjRef = useRef<File | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Use meta as fallback if file is not provided (for backward compatibility)
  // Memoize fileData to prevent unnecessary re-renders
  const fileData = useMemo(() => {
    return file || meta;
  }, [file, meta]);

  // Generate a cache key for file objects
  const getCacheKey = (fileObj: File): string => {
    return `${fileObj.name}-${fileObj.size}-${fileObj.lastModified}`;
  };

  // Get or create an object URL with caching
  const getObjectUrl = (fileObj: File): string => {
    const cacheKey = getCacheKey(fileObj);

    if (!objectUrlCache.has(cacheKey)) {
      // eslint-disable-next-line no-restricted-globals
      objectUrlCache.set(cacheKey, URL.createObjectURL(fileObj));
    }

    return objectUrlCache.get(cacheKey) as string;
  };

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

      // Clean up previous object URL if it exists and we're loading a new file
      if (fileObjRef.current !== fileObj && cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      if (fileObj && /image/.test(fileType)) {
        // Skip if it's the same exact file object
        if (fileObjRef.current !== fileObj) {
          const src = getObjectUrl(fileObj);
          setImgDataUrl(src);
          fileObjRef.current = fileObj;

          // Store cleanup function
          cleanupRef.current = () => {
            const cacheKey = getCacheKey(fileObj);
            if (objectUrlCache.has(cacheKey)) {
              // eslint-disable-next-line no-restricted-globals
              URL.revokeObjectURL(objectUrlCache.get(cacheKey) as string);
              objectUrlCache.delete(cacheKey);
            }
          };

          return cleanupRef.current;
        }

        // Return existing cleanup if same file
        return cleanupRef.current;
      }
      return null;
    };

    let isMounted = true;
    let cleanup: (() => void) | null = null;

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
  }, [fileData]);

  return imgDataUrl
    ? React.createElement("img", {
        src: imgDataUrl,
        ...imgProps,
      })
    : null;
}

export default ImgFile;
