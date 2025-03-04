import React, { useState, useEffect, ImgHTMLAttributes } from "react";
import { DocFileMeta } from "use-fireproof";

const { URL } = window;

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

export function ImgFile({ file, meta, ...imgProps }: ImgFileProps) {
  const [imgDataUrl, setImgDataUrl] = useState("");

  // Use meta as fallback if file is not provided (for backward compatibility)
  const fileData = file || meta;

  useEffect(() => {
    if (!fileData) return;

    // Helper function to determine if the object is a File-like object
    const isFile = (obj: FileType): obj is File =>
      "type" in obj && "size" in obj && "stream" in obj && typeof obj.stream === "function";

    // Helper function to determine if the object is a DocFileMeta
    const isFileMeta = (obj: FileType): obj is DocFileMeta =>
      "type" in obj && "size" in obj && "file" in obj && typeof obj.file === "function";

    const loadFile = async () => {
      let fileObj: File | null = null;
      let fileType = "";

      if (isFile(fileData)) {
        fileObj = fileData;
        fileType = fileData.type;
      } else if (isFileMeta(fileData)) {
        fileType = fileData.type;
        fileObj = (await fileData.file?.()) || null;
      }

      if (fileObj && /image/.test(fileType)) {
        const src = URL.createObjectURL(fileObj);
        setImgDataUrl(src);
        return () => URL.revokeObjectURL(src);
      }
    };

    let cleanup: (() => void) | undefined;
    loadFile().then((result) => {
      cleanup = result;
    });

    return () => {
      // The cleanup function from loadFile already revokes the URL
      // so we don't need to do it here as well
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
