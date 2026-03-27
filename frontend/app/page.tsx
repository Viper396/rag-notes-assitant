"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import UploadModal from "../components/UploadModal";

type SourceItem = {
  source: string;
  page: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  followUpQuestions?: string[];
};

type QueryResponse = {
  question: string;
  answer: string;
  sources: SourceItem[];
  follow_up_questions?: string[];
};

const ANSWER_PREFIX = '"answer":"';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:120ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:240ms]" />
    </div>
  );
}

export default function HomePage() {
  const [documents, setDocuments] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryDocument, setSummaryDocument] = useState<string>("");
  const [summaryText, setSummaryText] = useState<string>("");
  const [summaryError, setSummaryError] = useState<string>("");
  const [copyButtonLabel, setCopyButtonLabel] = useState("Copy to clipboard");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isSending,
    [input, isSending],
  );

  const fetchDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    try {
      const response = await fetch("/api/documents");
      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }

      const payload = (await response.json()) as { documents?: string[] };
      const nextDocuments = Array.isArray(payload.documents)
        ? payload.documents
        : [];
      setDocuments(nextDocuments);
      setSelectedDocuments((previous) => {
        if (!hasInitializedSelection) {
          return [...nextDocuments];
        }

        return previous.filter((doc) => nextDocuments.includes(doc));
      });
      setHasInitializedSelection(true);
    } catch {
      setDocuments([]);
      setSelectedDocuments([]);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [hasInitializedSelection]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isSending]);

  function toggleDocumentSelection(documentName: string) {
    setSelectedDocuments((previous) =>
      previous.includes(documentName)
        ? previous.filter((name) => name !== documentName)
        : [...previous, documentName],
    );
  }

  async function requestQueryResponse(params: {
    question: string;
    chatHistory?: Array<{ role: string; content: string }>;
    filterDocuments?: string[];
    onAnswerChunk?: (chunk: string) => void;
  }): Promise<QueryResponse | null> {
    const {
      question,
      chatHistory = [],
      filterDocuments,
      onAnswerChunk,
    } = params;

    const response = await fetch("/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        chat_history: chatHistory,
        ...(filterDocuments && filterDocuments.length > 0
          ? { filter_documents: filterDocuments }
          : {}),
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error("Unable to stream assistant response");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let rawJson = "";
    let inAnswer = false;
    let markerBuffer = "";
    let escapeNext = false;
    let unicodeBuffer = "";
    let unicodeRemaining = 0;

    const consumeCharacter = (char: string) => {
      if (!onAnswerChunk) {
        return;
      }

      if (!inAnswer) {
        markerBuffer = (markerBuffer + char).slice(-ANSWER_PREFIX.length);
        if (markerBuffer === ANSWER_PREFIX) {
          inAnswer = true;
          markerBuffer = "";
        }
        return;
      }

      if (unicodeRemaining > 0) {
        unicodeBuffer += char;
        unicodeRemaining -= 1;

        if (unicodeRemaining === 0) {
          const codePoint = Number.parseInt(unicodeBuffer, 16);
          if (!Number.isNaN(codePoint)) {
            onAnswerChunk(String.fromCharCode(codePoint));
          }
          unicodeBuffer = "";
        }
        return;
      }

      if (escapeNext) {
        escapeNext = false;
        switch (char) {
          case "n":
            onAnswerChunk("\n");
            break;
          case "r":
            onAnswerChunk("\r");
            break;
          case "t":
            onAnswerChunk("\t");
            break;
          case "\\":
            onAnswerChunk("\\");
            break;
          case '"':
            onAnswerChunk('"');
            break;
          case "/":
            onAnswerChunk("/");
            break;
          case "b":
            onAnswerChunk("\b");
            break;
          case "f":
            onAnswerChunk("\f");
            break;
          case "u":
            unicodeRemaining = 4;
            unicodeBuffer = "";
            break;
          default:
            onAnswerChunk(char);
            break;
        }
        return;
      }

      if (char === "\\") {
        escapeNext = true;
        return;
      }

      if (char === '"') {
        inAnswer = false;
        return;
      }

      onAnswerChunk(char);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      rawJson += chunk;

      for (const char of chunk) {
        consumeCharacter(char);
      }
    }

    try {
      return JSON.parse(rawJson) as QueryResponse;
    } catch {
      return null;
    }
  }

  async function handleSummarizeDocument(documentName: string) {
    if (isSummarizing) {
      return;
    }

    setIsSummaryDrawerOpen(true);
    setIsSummarizing(true);
    setSummaryDocument(documentName);
    setSummaryText("");
    setSummaryError("");
    setCopyButtonLabel("Copy to clipboard");

    try {
      const summaryPrompt = `Summarize the entire document ${documentName} in 8 bullet points covering the key concepts`;
      const parsed = await requestQueryResponse({
        question: summaryPrompt,
        chatHistory: [],
        filterDocuments: [documentName],
      });

      if (!parsed?.answer) {
        throw new Error("No summary returned");
      }

      setSummaryText(parsed.answer);
    } catch {
      setSummaryError("Failed to summarize this document. Please try again.");
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleCopySummary() {
    if (!summaryText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyButtonLabel("Copied!");
      window.setTimeout(() => setCopyButtonLabel("Copy to clipboard"), 1400);
    } catch {
      setCopyButtonLabel("Copy failed");
      window.setTimeout(() => setCopyButtonLabel("Copy to clipboard"), 1400);
    }
  }

  async function submitQuestion(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      sources: [],
      followUpQuestions: [],
    };

    const conversation = [...messages, userMessage];
    const chatHistory = conversation.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setInput("");
    setIsSending(true);

    try {
      const parsed = await requestQueryResponse({
        question,
        chatHistory,
        filterDocuments:
          selectedDocuments.length > 0 ? selectedDocuments : undefined,
        onAnswerChunk: (text) => {
          if (!text) {
            return;
          }

          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: message.content + text }
                : message,
            ),
          );
        },
      });

      if (parsed) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: parsed.answer ?? message.content,
                  sources: Array.isArray(parsed.sources) ? parsed.sources : [],
                  followUpQuestions: Array.isArray(parsed.follow_up_questions)
                    ? parsed.follow_up_questions
                    : [],
                }
              : message,
          ),
        );
      }
    } catch {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  "I hit an error while generating a response. Please try again.",
                sources: [],
                followUpQuestions: [],
              }
            : message,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleSend() {
    await submitQuestion(input);
  }

  function handleFollowUpClick(question: string) {
    setInput(question);
    void submitQuestion(question);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-900 text-white">
      <aside className="flex w-64 flex-col border-r border-zinc-700 bg-zinc-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">
            Documents
          </h2>
          <button
            type="button"
            onClick={() => void fetchDocuments()}
            className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 transition hover:border-zinc-400 hover:text-white"
          >
            {isLoadingDocs ? "..." : "Refresh"}
          </button>
        </div>

        <div className="mb-4">
          <UploadModal onUploadSuccess={() => void fetchDocuments()} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {documents.length === 0 ? (
            <p className="text-sm text-zinc-400">No uploaded documents yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((documentName) => (
                <li
                  key={documentName}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedDocuments.includes(documentName)}
                      onChange={() => toggleDocumentSelection(documentName)}
                      className="h-4 w-4 rounded border-zinc-500 bg-zinc-800 text-zinc-200 accent-zinc-200"
                    />
                    <span className="truncate">{documentName}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSummarizeDocument(documentName)}
                    className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 transition hover:border-zinc-300 hover:text-white"
                  >
                    Summarize
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          isSummaryDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsSummaryDrawerOpen(false)}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-xl flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl transition-transform duration-300 ${
          isSummaryDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-700 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              Document Summary
            </h3>
            <p className="text-xs text-zinc-400">
              {summaryDocument || "No document selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsSummaryDrawerOpen(false)}
            className="rounded-md border border-zinc-600 px-3 py-1 text-xs text-zinc-200 hover:border-zinc-300"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isSummarizing ? (
            <div className="mt-2">
              <p className="mb-3 text-sm text-zinc-300">
                Generating summary...
              </p>
              <TypingIndicator />
            </div>
          ) : summaryError ? (
            <p className="text-sm text-red-300">{summaryError}</p>
          ) : summaryText ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{summaryText}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Choose a document and click Summarize.
            </p>
          )}
        </div>

        <div className="border-t border-zinc-700 px-5 py-4">
          <button
            type="button"
            onClick={() => void handleCopySummary()}
            disabled={!summaryText || isSummarizing}
            className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-300"
          >
            {copyButtonLabel}
          </button>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-32 pt-6 md:px-8">
          {messages.length === 0 ? (
            <div className="mx-auto mt-20 max-w-2xl text-center text-zinc-400">
              Ask a question about your uploaded notes to start chatting.
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isAssistantTyping =
                  message.role === "assistant" &&
                  isSending &&
                  message.content.length === 0;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 md:max-w-[75%] ${
                        isUser
                          ? "bg-zinc-700 text-white"
                          : "border border-zinc-700 bg-zinc-800 text-zinc-100"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      ) : isAssistantTyping ? (
                        <TypingIndicator />
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      )}

                      {!isUser &&
                      message.sources &&
                      message.sources.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.sources.map((source, index) => (
                            <span
                              key={`${source.source}-${source.page}-${index}`}
                              className="rounded-full border border-zinc-600 bg-zinc-700/60 px-2 py-1 text-xs text-zinc-200"
                            >
                              {source.source} p.{source.page}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {!isUser &&
                      message.followUpQuestions &&
                      message.followUpQuestions.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.followUpQuestions.map(
                            (followUpQuestion, index) => (
                              <button
                                key={`${message.id}-followup-${index}`}
                                type="button"
                                onClick={() =>
                                  handleFollowUpClick(followUpQuestion)
                                }
                                className="rounded-full border border-zinc-500 bg-zinc-900 px-3 py-1 text-left text-xs text-zinc-200 transition hover:border-zinc-300 hover:bg-zinc-700"
                              >
                                {followUpQuestion}
                              </button>
                            ),
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-zinc-700 bg-zinc-900/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              rows={2}
              placeholder="Ask about your notes..."
              className="max-h-48 min-h-[52px] flex-1 resize-y rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm text-white placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="h-[52px] rounded-xl bg-white px-5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-300"
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
