import { LRUMap } from "@adviser/cement";
import { DocFileMeta } from "@fireproof/core-types-base";
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, ImgHTMLAttributes } from "react";

// Cache for object URLs to avoid recreating them unnecessarily
// Use LRUMap with maxEntries to manage memory usage
const objectUrlCache = new LRUMap<string, string>({
  maxEntries: 50, // Limit to 50 cached object URLs to manage memory
});

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

// Generate a namespaced cache key for file objects
function getCacheKey(fileObj: File): string {
  return `file:${fileObj.name}-${fileObj.size}-${fileObj.lastModified}`;
}

// Keyed variant so we can use DocFileMeta.cid for stable identity
function getObjectUrlByKey(cacheKey: string, fileObj: File): string {
  if (!objectUrlCache.has(cacheKey)) {
    // eslint-disable-next-line no-restricted-globals
    objectUrlCache.set(cacheKey, URL.createObjectURL(fileObj));
  }
  return objectUrlCache.get(cacheKey) as string;
}

async function loadFile({
  fileData,
  fileObjRef,
  cleanupRef,
  setImgDataUrl,
  keyRef,
}: {
  fileData?: FileType;
  fileObjRef: React.RefObject<File | null>;
  setImgDataUrl: React.Dispatch<React.SetStateAction<string>>;
  cleanupRef: React.RefObject<{ contentKey: string; revoke: () => void } | null>;
  keyRef: React.RefObject<string | null>;
}) {
  let fileObj: File | null = null;
  let fileType = "";

  // Make sure fileData is defined before checking its type
  if (fileData) {
    switch (true) {
      case isFile(fileData):
        fileObj = fileData;
        fileType = fileData.type;
        break;
      case isFileMeta(fileData):
        fileType = fileData.type;
        fileObj = typeof fileData.file === "function" ? await fileData.file() : null;
        break;
    }
  }

  // Use namespaced keys to prevent collisions: 'cid:' for DocFileMeta, 'file:' for File objects
  const currentKey = keyRef.current ?? null;
  const newKey =
    fileData && isFileMeta(fileData) && fileData.cid
      ? `cid:${String(fileData.cid)}`
      : fileData && isFile(fileData)
        ? getCacheKey(fileData) // Already includes 'file:' prefix
        : null;
  const isDifferentFile = currentKey !== newKey;

  // If same content key, check if we have a cached URL we can reuse
  const canReuseCache = !isDifferentFile && newKey && objectUrlCache.has(newKey);

  // Defer cleanup of previous URL until after new URL is set

  if (fileObj && /image/.test(fileType)) {
    // Handle different file content
    if (isDifferentFile && newKey) {
      const src = getObjectUrlByKey(newKey, fileObj);
      setImgDataUrl(src);
      fileObjRef.current = fileObj;
      const prevCleanup = cleanupRef.current;
      // Create content-aware cleanup function to return
      const newCleanupObj = {
        contentKey: newKey,
        revoke: () => {
          if (objectUrlCache.has(newKey)) {
            // eslint-disable-next-line no-restricted-globals
            URL.revokeObjectURL(objectUrlCache.get(newKey) as string);
            objectUrlCache.delete(newKey);
          }
        },
      };
      keyRef.current = newKey;
      if (prevCleanup && prevCleanup.revoke) {
        prevCleanup.revoke();
      }

      return newCleanupObj;
    }

    // Handle same content key - reuse existing cached URL if available
    if (canReuseCache && newKey) {
      const src = objectUrlCache.get(newKey) as string;
      setImgDataUrl(src);
      fileObjRef.current = fileObj;
      keyRef.current = newKey;
      // Keep existing cleanup function - don't create a new one or call prevCleanup
      return cleanupRef.current;
    }

    // Return existing cleanup if same file and no cached URL
    return cleanupRef.current;
  }
  return null;
}

export function ImgFile({ file, meta, ...imgProps }: ImgFileProps) {
  const [imgDataUrl, setImgDataUrl] = useState("");
  const fileObjRef = useRef<File | null>(null);
  const cleanupRef = useRef<{ contentKey: string; revoke: () => void } | null>(null);
  const keyRef = useRef<string | null>(null);
  const nextFileDataRef = useRef<FileType | undefined>(undefined);

  // Use meta as fallback if file is not provided (for backward compatibility)
  // Memoize fileData to prevent unnecessary re-renders
  const fileData = useMemo(() => {
    return file || meta;
  }, [file, meta]);

  // Use layoutEffect to update tracking ref before useEffect cleanup runs
  useLayoutEffect(() => {
    nextFileDataRef.current = fileData;
  }, [fileData]);

  useEffect(() => {
    if (!fileData) return;
    let isMounted = true;

    loadFile({ fileData, fileObjRef, cleanupRef, setImgDataUrl, keyRef }).then(function handleResult(result) {
      if (isMounted) {
        // Store the result in cleanupRef.current if component is still mounted
        cleanupRef.current = result;
      } else if (result && result.revoke) {
        // If component unmounted before promise resolved, call cleanup immediately
        result.revoke();
      }
    });

    return function cleanupEffect() {
      isMounted = false;

      // Content-aware conditional cleanup: only revoke URLs when content actually changes
      if (cleanupRef.current) {
        const currentContentKey = cleanupRef.current.contentKey;

        // Compute next content key from the upcoming fileData (same logic as in loadFile)
        let nextContentKey = null;
        const upcomingFileData = nextFileDataRef.current;
        if (upcomingFileData) {
          if (isFileMeta(upcomingFileData) && upcomingFileData.cid) {
            nextContentKey = `cid:${String(upcomingFileData.cid)}`;
          } else if (isFile(upcomingFileData)) {
            nextContentKey = `file:${upcomingFileData.name}-${upcomingFileData.size}-${upcomingFileData.lastModified}`;
          }
        }

        // Different cleanup logic for File vs DocFileMeta objects:
        // - File objects: Always cleanup on effect change (including unmount)
        // - DocFileMeta objects: Only cleanup when CID actually changes
        const isContentChanging = currentContentKey !== nextContentKey;
        const isFileObject = currentContentKey?.startsWith("file:");
        const isDocFileMetaObject = currentContentKey?.startsWith("cid:");

        const shouldCleanup = isFileObject || (isDocFileMetaObject && isContentChanging);

        if (shouldCleanup && cleanupRef.current.revoke) {
          cleanupRef.current.revoke();
        }

        cleanupRef.current = null;
      }
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
