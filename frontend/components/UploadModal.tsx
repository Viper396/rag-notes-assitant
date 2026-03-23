"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type UploadResponse = {
  message: string;
  document: string;
  chunks_stored: number;
};

type UploadModalProps = {
  onUploadSuccess: () => void;
};

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

function formatBytes(sizeInBytes: number): string {
  const mb = sizeInBytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export default function UploadModal({ onUploadSuccess }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const closeModal = useCallback(() => {
    if (isUploading) {
      return;
    }

    setIsOpen(false);
    setSelectedFile(null);
    setProgress(0);
  }, [isUploading]);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }

      setToast({ type, message });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 3000);
    },
    [],
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFile(acceptedFiles[0] ?? null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_FILE_SIZE_BYTES,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  const dropzoneClasses = useMemo(() => {
    return [
      "rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
      isDragActive
        ? "border-zinc-300 bg-zinc-700/40"
        : "border-zinc-500 bg-zinc-800 hover:border-zinc-300",
    ].join(" ");
  }, [isDragActive]);

  const uploadFile = useCallback(async () => {
    if (!selectedFile || isUploading) {
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
        };

        xhr.onerror = () => {
          reject(new Error("Network error during upload"));
        };

        xhr.onload = () => {
          let payload: unknown = null;
          try {
            payload = JSON.parse(xhr.responseText) as unknown;
          } catch {
            payload = null;
          }

          if (xhr.status >= 200 && xhr.status < 300 && payload) {
            resolve(payload as UploadResponse);
            return;
          }

          const message =
            typeof payload === "object" &&
            payload !== null &&
            "detail" in payload &&
            typeof (payload as { detail?: unknown }).detail === "string"
              ? (payload as { detail: string }).detail
              : "Upload failed";

          reject(new Error(message));
        };

        xhr.send(formData);
      });

      showToast(
        "success",
        `Uploaded! ${response.chunks_stored} chunks indexed`,
      );
      setIsOpen(false);
      setSelectedFile(null);
      setProgress(0);
      onUploadSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      showToast("error", message);
    } finally {
      setIsUploading(false);
    }
  }, [isUploading, onUploadSuccess, selectedFile, showToast]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
      >
        + Upload Notes
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Upload PDF Notes
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-400"
              >
                Close
              </button>
            </div>

            <div {...getRootProps({ className: dropzoneClasses })}>
              <input {...getInputProps()} />
              <p className="text-sm text-zinc-200">
                Drag and drop a PDF here, or click to select a file.
              </p>
              <p className="mt-1 text-xs text-zinc-400">PDF only, max 20MB.</p>
            </div>

            {selectedFile ? (
              <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-zinc-100">
                <p className="truncate font-medium">{selectedFile.name}</p>
                <p className="text-zinc-400">
                  {formatBytes(selectedFile.size)}
                </p>
              </div>
            ) : null}

            {isUploading ? (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-300">
                  <span>Uploading</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full bg-zinc-300 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isUploading}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void uploadFile()}
                disabled={!selectedFile || isUploading}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-500"
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-4 top-4 z-[60]">
          <div
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-100"
                : "border-red-400/30 bg-red-500/20 text-red-100"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </>
  );
}
