import { LRUMap } from "@adviser/cement";
import { DocFileMeta } from "@fireproof/core-types-base";
import React, { useState, useEffect, useRef, useMemo, ImgHTMLAttributes } from "react";

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
  cleanupRef: React.RefObject<(() => void) | null>;
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

  // Defer cleanup of previous URL until after new URL is set

  if (fileObj && /image/.test(fileType)) {
    // Skip if it's the same file content (even if different object reference)
    if (isDifferentFile && newKey) {
      const src = getObjectUrlByKey(newKey, fileObj);
      setImgDataUrl(src);
      fileObjRef.current = fileObj;
      const prevCleanup = cleanupRef.current;
      // Store cleanup function keyed by content identity
      cleanupRef.current = () => {
        if (objectUrlCache.has(newKey)) {
          // eslint-disable-next-line no-restricted-globals
          URL.revokeObjectURL(objectUrlCache.get(newKey) as string);
          objectUrlCache.delete(newKey);
        }
      };
      keyRef.current = newKey;
      if (prevCleanup) prevCleanup();

      return cleanupRef.current;
    }

    // Return existing cleanup if same file
    return cleanupRef.current;
  }
  return null;
}

export function ImgFile({ file, meta, ...imgProps }: ImgFileProps) {
  const [imgDataUrl, setImgDataUrl] = useState("");
  const fileObjRef = useRef<File | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const keyRef = useRef<string | null>(null);
  const prevStableKeyRef = useRef<string | null>(null);
  const isUnmountingRef = useRef<boolean>(false);

  // Use meta as fallback if file is not provided (for backward compatibility)
  // Memoize fileData to prevent unnecessary re-renders
  const fileData = useMemo(() => {
    return file || meta;
  }, [file, meta]);

  // Create a stable key for useEffect dependency to prevent unnecessary cleanup
  const stableKey = useMemo(() => {
    if (!fileData) return null;
    if (isFileMeta(fileData) && fileData.cid) {
      return `cid:${String(fileData.cid)}`;
    }
    if (isFile(fileData)) {
      return `file:${fileData.name}-${fileData.size}-${fileData.lastModified}`;
    }
    return null;
  }, [fileData]);

  useEffect(() => {
    if (!fileData) return;
    let isMounted = true;
    
    // Track if stable key is changing to determine cleanup behavior
    const currentStableKey = stableKey;
    const prevStableKey = prevStableKeyRef.current;
    const isStableKeyChanging = prevStableKey !== null && prevStableKey !== currentStableKey;
    
    loadFile({ fileData, fileObjRef, cleanupRef, setImgDataUrl, keyRef }).then(function handleResult(result) {
      if (isMounted) {
        // Store the result in cleanupRef.current if component is still mounted
        cleanupRef.current = result;
      } else if (result) {
        // If component unmounted before promise resolved, call cleanup immediately
        result();
      }
    });

    return function cleanupEffect() {
      isMounted = false;
      
      // Cleanup on unmount or when stable key actually changes (not on first render or same key)
      const shouldCleanup = isUnmountingRef.current || (prevStableKey !== null && isStableKeyChanging);
      
      if (cleanupRef.current && shouldCleanup) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      
      // Update the previous stable key for next comparison
      prevStableKeyRef.current = currentStableKey;
    };
  }, [fileData, stableKey]);

  // Track component unmounting
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
    };
  }, []);

  return imgDataUrl
    ? React.createElement("img", {
        src: imgDataUrl,
        ...imgProps,
      })
    : null;
}

export default ImgFile;
