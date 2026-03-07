import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Youtube,
  Image as ImageIcon,
  Link,
  FileUp,
} from "lucide-react";
import { getUploadUrl, uploadFileToS3, ingestYouTubeUrl } from "../lib/api";

interface FileUploaderProps {
  onUploadComplete: () => void;
}

type UploadStatus =
  | "idle"
  | "getting-url"
  | "uploading"
  | "processing"
  | "success"
  | "error";

type InputTab = "file" | "youtube";

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [activeTab, setActiveTab] = useState<InputTab>("file");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [youtubeStatusMsg, setYoutubeStatusMsg] = useState("");

  // ─── File Upload (PDF + Images) ─────────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setErrorMessage("");
      setResultMessage("");
      setProgress(0);

      try {
        // Step 1: Get pre-signed URL
        setStatus("getting-url");
        const { uploadUrl } = await getUploadUrl(file.name, file.type);

        // Step 2: Upload to S3
        setStatus("uploading");
        await uploadFileToS3(uploadUrl, file, (p) => setProgress(p));

        // Step 3: Processing (triggered automatically by S3 event)
        setStatus("processing");
        await new Promise((r) => setTimeout(r, 2000));

        setStatus("success");
        setResultMessage(`${file.name} uploaded & queued for processing!`);
        onUploadComplete();

        // Reset after success
        setTimeout(() => {
          setStatus("idle");
          setProgress(0);
          setFileName("");
          setResultMessage("");
        }, 3000);
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Upload failed"
        );
      }
    },
    [onUploadComplete]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled: status !== "idle" && status !== "error" && status !== "success",
  });

  // ─── YouTube URL Ingestion ──────────────────────────────────────

  const handleYouTubeSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const url = youtubeUrl.trim();
      if (!url) return;

      setErrorMessage("");
      setResultMessage("");

      try {
        setStatus("processing");
        setFileName(url);
        setYoutubeStatusMsg("");

        const result = await ingestYouTubeUrl(url, (msg) =>
          setYoutubeStatusMsg(msg)
        );

        setYoutubeStatusMsg("");
        setStatus("success");
        setResultMessage(
          `"${result.documentName}" processed — ${result.chunksCreated} chunks indexed!`
        );
        onUploadComplete();

        setTimeout(() => {
          setStatus("idle");
          setYoutubeUrl("");
          setResultMessage("");
        }, 4000);
      } catch (error) {
        setYoutubeStatusMsg("");
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to process video"
        );
      }
    },
    [youtubeUrl, onUploadComplete]
  );

  // ─── Tab Reset ──────────────────────────────────────────────────

  const switchTab = (tab: InputTab) => {
    if (status !== "idle" && status !== "error" && status !== "success") return;
    setActiveTab(tab);
    setStatus("idle");
    setErrorMessage("");
    setResultMessage("");
    setProgress(0);
    setFileName("");
  };

  // ─── Shared Status UI ──────────────────────────────────────────

  const renderStatusOverlay = () => {
    if (status === "idle") return null;

    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center py-4">
        {/* Loading States */}
        {(status === "getting-url" ||
          status === "uploading" ||
          status === "processing") && (
            <>
              <div className="p-3 rounded-2xl bg-primary-500/10">
                <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />
              </div>

              {status === "getting-url" && (
                <p className="text-sm text-primary-300">Preparing upload...</p>
              )}

              {status === "uploading" && (
                <div className="w-full max-w-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary-400" />
                    <p className="text-sm text-dark-200 truncate">{fileName}</p>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary-500 to-primary-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-dark-400 mt-1 text-right">
                    {progress}%
                  </p>
                </div>
              )}

              {status === "processing" && (
                <div>
                  <p className="text-sm text-primary-300 font-medium">
                    {activeTab === "youtube"
                      ? (youtubeStatusMsg || "Processing video...")
                      : "Processing document..."}
                  </p>
                  <p className="text-xs text-dark-400 mt-1">
                    {activeTab === "youtube"
                      ? "Fetching captions in browser, then generating embeddings & indexing"
                      : "Extracting content, generating embeddings & indexing"}
                  </p>
                </div>
              )}
            </>
          )}

        {/* Success */}
        {status === "success" && (
          <>
            <div className="p-3 rounded-2xl bg-green-500/10">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <p className="text-sm text-green-400 font-medium">
              ✓ {resultMessage || "Processed successfully!"}
            </p>
          </>
        )}

        {/* Error */}
        {status === "error" && (
          <>
            <div className="p-3 rounded-2xl bg-red-500/10">
              <XCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-red-400 font-medium">
                {activeTab === "youtube"
                  ? "Failed to process video"
                  : "Upload failed"}
              </p>
              <p className="text-xs text-dark-400 mt-1">{errorMessage}</p>
              <button
                onClick={() => setStatus("idle")}
                className="text-xs text-primary-400 hover:text-primary-300 mt-2 underline"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────

  const isLocked =
    status !== "idle" && status !== "error" && status !== "success";

  return (
    <div className="w-full space-y-3">
      {/* Tabs */}
      <div className="flex rounded-xl bg-dark-800/50 p-1 gap-1">
        <button
          onClick={() => switchTab("file")}
          disabled={isLocked}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${activeTab === "file"
              ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20"
              : "text-dark-400 hover:text-white hover:bg-white/5"
            } disabled:opacity-50`}
        >
          <FileUp className="w-3.5 h-3.5" />
          PDF / Image
        </button>
        <button
          onClick={() => switchTab("youtube")}
          disabled={isLocked}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${activeTab === "youtube"
              ? "bg-red-600 text-white shadow-lg shadow-red-500/20"
              : "text-dark-400 hover:text-white hover:bg-white/5"
            } disabled:opacity-50`}
        >
          <Youtube className="w-3.5 h-3.5" />
          YouTube
        </button>
      </div>

      {/* File Upload Tab */}
      {activeTab === "file" && (
        <>
          {status !== "idle" ? (
            <div className="rounded-2xl border-2 border-dashed border-dark-600 p-6">
              {renderStatusOverlay()}
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={`
                relative overflow-hidden rounded-2xl border-2 border-dashed p-6
                transition-all duration-300 cursor-pointer
                ${isDragActive
                  ? "border-primary-400 bg-primary-500/10 scale-[1.02]"
                  : "border-dark-600 hover:border-primary-500/50 hover:bg-white/5"
                }
              `}
            >
              <input {...getInputProps()} />

              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <div
                  className={`p-3 rounded-2xl transition-colors ${isDragActive ? "bg-primary-500/20" : "bg-dark-800"
                    }`}
                >
                  <Upload
                    className={`w-7 h-7 ${isDragActive ? "text-primary-400" : "text-dark-400"
                      }`}
                  />
                </div>
                <div>
                  <p className="text-base font-medium text-dark-200">
                    {isDragActive
                      ? "Drop your file here"
                      : "Drag & drop a file"}
                  </p>
                  <p className="text-xs text-dark-400 mt-1">
                    or click to browse
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-dark-800 text-xs text-dark-400">
                      <FileText className="w-3 h-3" />
                      PDF
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-dark-800 text-xs text-dark-400">
                      <ImageIcon className="w-3 h-3" />
                      PNG / JPG / WebP / GIF
                    </span>
                  </div>
                  <p className="text-xs text-dark-500 mt-2">Max 50MB</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* YouTube Tab */}
      {activeTab === "youtube" && (
        <div className="rounded-2xl border-2 border-dashed border-dark-600 p-6">
          {status !== "idle" ? (
            renderStatusOverlay()
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 rounded-2xl bg-red-500/10">
                <Youtube className="w-7 h-7 text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-base font-medium text-dark-200">
                  Paste a YouTube link
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  We'll extract the transcript and index it
                </p>
              </div>
              <form
                onSubmit={handleYouTubeSubmit}
                className="w-full flex gap-2"
              >
                <div className="flex-1 relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-dark-800 border border-dark-600 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!youtubeUrl.trim()}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-dark-700 disabled:text-dark-500 text-white text-sm font-medium transition-colors shrink-0"
                >
                  Ingest
                </button>
              </form>
              <p className="text-xs text-dark-500">
                Video must have captions/subtitles enabled
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
