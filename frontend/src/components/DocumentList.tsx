import { useState, useEffect } from "react";
import {
  FileText,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
  Loader2,
} from "lucide-react";
import {
  listDocuments as fetchDocuments,
  deleteDocument as removeDocument,
  Document,
} from "../lib/api";

interface DocumentListProps {
  refreshTrigger: number;
}

export default function DocumentList({ refreshTrigger }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchDocuments();
      setDocuments(data.documents);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load documents"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [refreshTrigger]);

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      setDeletingId(documentId);
      await removeDocument(documentId);
      setDocuments((prev) =>
        prev.filter((doc) => doc.documentId !== documentId)
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete document"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="glass rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-400" />
          Processed Documents
        </h2>
        <button
          onClick={loadDocuments}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-dark-400 hover:text-white disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      {loading && documents.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          <span className="ml-2 text-dark-400">Loading documents...</span>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={loadDocuments}
            className="mt-2 text-xs text-primary-400 hover:text-primary-300"
          >
            Try again
          </button>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="w-10 h-10 text-dark-600 mx-auto mb-2" />
          <p className="text-dark-400 text-sm">No documents uploaded yet</p>
          <p className="text-dark-500 text-xs mt-1">
            Upload a PDF to get started
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.documentId}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-primary-500/10 shrink-0">
                <FileText className="w-4 h-4 text-primary-400" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark-200 truncate">
                  {doc.fileName}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-dark-500 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {formatFileSize(doc.size)}
                  </span>
                  <span className="text-xs text-dark-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(doc.lastModified)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(doc.documentId)}
                disabled={deletingId === doc.documentId}
                className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all text-dark-400 hover:text-red-400 disabled:opacity-50"
                title="Delete document"
              >
                {deletingId === doc.documentId ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {documents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <p className="text-xs text-dark-500">
            {documents.length} document{documents.length !== 1 ? "s" : ""}{" "}
            indexed
          </p>
        </div>
      )}
    </div>
  );
}
