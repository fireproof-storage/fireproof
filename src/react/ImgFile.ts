import React, { useState, useEffect, ImgHTMLAttributes } from "react";
import { DocFileMeta } from "use-fireproof";

const { URL } = window;

// Union type to support both direct File objects and metadata objects
type FileType = File | DocFileMeta;

interface ImgFileProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  file: FileType;
}

export function ImgFile({ file, ...imgProps }: ImgFileProps) {
  const [imgDataUrl, setImgDataUrl] = useState("");

  useEffect(() => {
    // Helper function to determine if the object is a File
    const isFile = (obj: FileType): obj is File => obj instanceof File;

    // Helper function to determine if the object is a ImgFileMeta
    const isFileMeta = (obj: DocFileMeta): obj is DocFileMeta =>
      obj && typeof obj.file === "function" && typeof obj.type === "string";

    const loadFile = async () => {
      let fileObj: File | null = null;
      let fileType = "";

      if (isFile(file)) {
        fileObj = file;
        fileType = file.type;
      } else if (isFileMeta(file)) {
        fileType = file.type;
        fileObj = (await file.file?.()) || null;
      }

      if (fileObj && /image/.test(fileType)) {
        const src = URL.createObjectURL(fileObj);
        setImgDataUrl(src);
        return () => URL.revokeObjectURL(src);
      }
    };

    loadFile();

    return () => {
      if (imgDataUrl) {
        URL.revokeObjectURL(imgDataUrl);
      }
    };
  }, [file]);

  return imgDataUrl
    ? React.createElement("img", {
        src: imgDataUrl,
        ...imgProps,
      })
    : null;
}

export default ImgFile;
