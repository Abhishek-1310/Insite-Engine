import { useState } from "react";
import { Brain, Github, Zap } from "lucide-react";
import FileUploader from "./components/FileUploader";
import DocumentList from "./components/DocumentList";
import ChatInterface from "./components/ChatInterface";

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeDocumentId, setActiveDocumentId] = useState<string | undefined>(undefined);

  const handleUploadComplete = (documentId?: string) => {
    // Trigger document list refresh
    setRefreshTrigger((prev) => prev + 1);
    // Switch chat context to the newly ingested document
    if (documentId) setActiveDocumentId(documentId);
  };

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary-950/30 via-dark-950 to-purple-950/20 pointer-events-none" />

      {/* Header */}
      <header className="relative border-b border-white/5 bg-dark-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 shadow-lg shadow-primary-500/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Insight Engine
                </h1>
                <p className="text-xs text-dark-400">
                  AI-Powered Second Brain
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                <Zap className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400 font-medium">
                  Gemini 1.5 Flash
                </span>
              </div>
              <a
                href="https://github.com/Abhishek-1310/Insite-Engine"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-white/5 transition-colors text-dark-400 hover:text-white"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload + Documents */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Section */}
            <div>
              <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
                Add Knowledge Source
              </h2>
              <FileUploader onUploadComplete={handleUploadComplete} />
            </div>

            {/* Documents List */}
            <DocumentList refreshTrigger={refreshTrigger} />
          </div>

          {/* Right Column: Chat Interface */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
              Chat with Your Documents
            </h2>
            <ChatInterface documentId={activeDocumentId} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/5 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-dark-500">
              Built with React, Gemini AI, Pinecone & AWS Lambda
            </p>
            <div className="flex items-center gap-4 text-xs text-dark-600">
              <span>RAG Architecture</span>
              <span>•</span>
              <span>Serverless</span>
              <span>•</span>
              <span>TypeScript</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
