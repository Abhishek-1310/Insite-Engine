import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  FileText,
  MessageSquare,
} from "lucide-react";
import { askQuestion, AskResponse } from "../lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AskResponse["sources"];
  timestamp: Date;
}

interface ChatInterfaceProps {
  documentId?: string;
}

export default function ChatInterface({ documentId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clear chat history whenever the active document changes
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [documentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await askQuestion(question, documentId);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please make sure you have uploaded some documents first.`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="glass rounded-2xl flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <div className="p-2 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">
            Ask Insight Engine
          </h2>
          <p className="text-xs text-dark-400">
            Ask questions about your uploaded documents
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-2xl bg-dark-800/50 mb-4">
              <MessageSquare className="w-10 h-10 text-dark-500" />
            </div>
            <p className="text-dark-400 text-lg font-medium">
              Start a conversation
            </p>
            <p className="text-dark-500 text-sm mt-1 max-w-sm">
              Upload a document and ask questions about its content. The AI will
              find relevant information and answer based on your documents.
            </p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {[
                "What skills are mentioned?",
                "Summarize the experience section",
                "What projects are listed?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-1.5 rounded-full text-xs bg-dark-800 text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 animate-slide-up ${message.role === "user" ? "justify-end" : ""
                }`}
            >
              {message.role === "assistant" && (
                <div className="shrink-0 mt-1">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}

              <div
                className={`max-w-[80%] ${message.role === "user"
                    ? "bg-primary-600 rounded-2xl rounded-tr-md px-4 py-3"
                    : "bg-dark-800/50 rounded-2xl rounded-tl-md px-4 py-3"
                  }`}
              >
                {message.role === "assistant" ? (
                  <div className="prose-chat text-sm text-dark-200">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-white">{message.content}</p>
                )}

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/10">
                    <p className="text-xs text-dark-400 mb-1.5 font-medium">
                      Sources:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {message.sources.map((source, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-dark-700/50 text-xs text-dark-300"
                          title={`Relevance: ${(source.score * 100).toFixed(1)}%`}
                        >
                          <FileText className="w-3 h-3" />
                          {source.documentName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {message.role === "user" && (
                <div className="shrink-0 mt-1">
                  <div className="p-1.5 rounded-lg bg-dark-700">
                    <User className="w-4 h-4 text-dark-300" />
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing Indicator */}
        {isLoading && (
          <div className="flex gap-3 animate-fade-in">
            <div className="shrink-0 mt-1">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600">
                <Bot className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="bg-dark-800/50 rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary-400 typing-dot" />
                <div className="w-2 h-2 rounded-full bg-primary-400 typing-dot" />
                <div className="w-2 h-2 rounded-full bg-primary-400 typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your documents..."
              rows={1}
              className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 resize-none transition-colors"
              style={{
                minHeight: "44px",
                maxHeight: "120px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "44px";
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:bg-dark-700 disabled:text-dark-500 text-white transition-all duration-200 shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
