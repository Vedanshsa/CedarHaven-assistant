"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  LogOut,
  Menu,
  MessageSquareText,
  Mic,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { AppConfig } from "@/app-config";
import type { AnswerPayload } from "@/hooks/useCedarhavenAnswers";
import { EvidenceView } from "@/components/cedarhaven/evidence-panel";
import { InlineVoiceCall, type SavedMessage } from "@/app/components/inline-voice-call";

type User = { id: string; name: string; email: string };
type Chat = { id: string; title: string };
type Message = SavedMessage;
type UploadItem = { id: string; filename: string };

export function AccountChat({ appConfig }: { appConfig: AppConfig }) {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [question, setQuestion] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [error, setError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatIdRef = useRef("");
  chatIdRef.current = chatId;

  const loadChats = useCallback(async () => {
    const response = await fetch("/api/chats");
    if (!response.ok) {
      throw new Error(response.status === 401
        ? "Your session expired. Please sign in again."
        : "Could not load your saved chats.");
    }
    const list: Chat[] = await response.json();
    setChats(list);
    if (!chatIdRef.current && list.length) setChatId(list[0].id);
  }, []);

  const applyChatHistory = useCallback((selectedChatId: string, rows: Message[]) => {
    if (chatIdRef.current !== selectedChatId) return;
    setMessages(rows);
    const latest = [...rows].reverse().find(message => message.role === "assistant" && message.sources?.length);
    if (latest) {
      setAnswer({
        question: rows[Math.max(0, rows.indexOf(latest) - 1)]?.content || "",
        answer: latest.content,
        status: latest.sources?.[0]?.status || "answered",
        sources: latest.sources!.map(({ status: _status, ...source }) => source),
        checks: { retrieved: [], rejected: 0, repaired: false },
      });
    } else {
      setAnswer(null);
    }
  }, []);

  const refreshChatHistory = useCallback(async (selectedChatId: string) => {
    const response = await fetch(`/api/chats/${encodeURIComponent(selectedChatId)}`);
    if (!response.ok) throw new Error("Could not load this chat's history.");
    const rows: Message[] = await response.json();
    applyChatHistory(selectedChatId, rows);
  }, [applyChatHistory]);

  const handleVoiceHistoryUpdate = useCallback((rows: Message[]) => {
    applyChatHistory(chatId, rows);
  }, [applyChatHistory, chatId]);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then(async response => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not connect to the account service.");
        return (await response.json()).user as User;
      })
      .then(account => { if (active && account) setUser(account); })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not check your sign-in status.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingHistory(true);
    void loadChats()
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not load saved chats."))
      .finally(() => setLoadingHistory(false));
  }, [user, loadChats]);

  useEffect(() => {
    if (!user || !chatId) {
      setUploads([]);
      return;
    }
    let active = true;
    setUploads([]);
    fetch(`/api/uploads?chatId=${encodeURIComponent(chatId)}`)
      .then(async response => {
        if (!response.ok) throw new Error("Could not load this chat's documents.");
        return response.json() as Promise<UploadItem[]>;
      })
      .then(items => { if (active) setUploads(items); })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this chat's documents.");
      });
    return () => { active = false; };
  }, [user, chatId]);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setAnswer(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await refreshChatHistory(chatId);
    };
    void refresh().catch(() => { if (active) setError("Could not load this chat's history."); });
    const timer = voiceOpen
      ? window.setInterval(() => {
          void refresh().catch(() => {
            if (active) setError("Could not refresh this chat's history.");
          });
        }, 1800)
      : undefined;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [chatId, voiceOpen, refreshChatHistory]);

  async function closeVoiceCall() {
    setVoiceOpen(false);
    if (!chatId) return;
    try {
      await refreshChatHistory(chatId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this chat's history.");
    }
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup" && password !== confirm) throw new Error("Passwords do not match.");
      const response = await fetch(`/api/auth/${mode === "signup" ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup"
          ? { name, email, phone: phone || null, password, confirm_password: confirm }
          : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not sign in.");
      setUser(data.user);
      setPassword("");
      setConfirm("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function createChat() {
    const response = await fetch("/api/chats", { method: "POST" });
    if (!response.ok) {
      setError("Could not create a new chat.");
      return;
    }
    const chat: Chat = await response.json();
    setChats(current => [chat, ...current]);
    setChatId(chat.id);
    setMessages([]);
    setAnswer(null);
    setMobileHistoryOpen(false);
  }

  async function sendQuestion(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setQuestion("");
    setBusy(true);
    setError("");
    setMessages(current => [...current, { role: "user", content: text }]);
    try {
      let activeChat = chatId;
      if (!activeChat) {
        const createResponse = await fetch("/api/chats", { method: "POST" });
        if (!createResponse.ok) throw new Error("Could not create a chat.");
        const chat: Chat = await createResponse.json();
        activeChat = chat.id;
        setChatId(chat.id);
        setChats(current => [chat, ...current]);
      }
      const response = await fetch(`/api/chats/${encodeURIComponent(activeChat)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not answer that question.");
      const storedSources = (data.sources || []).map((source: AnswerPayload["sources"][number], index: number) => ({
        ...source,
        id: source.id || String(index),
        status: data.status,
      }));
      setMessages(current => [...current, { role: "assistant", content: data.answer, sources: storedSources }]);
      setAnswer({
        question: text,
        ...data,
        checks: { retrieved: [], rejected: 0, repaired: false },
        sources: (data.sources || []).map((source: AnswerPayload["sources"][number], index: number) => ({
          ...source,
          id: source.id || String(index),
        })),
      });
      await loadChats();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      let targetChatId = chatId;
      if (!targetChatId) {
        const chatResponse = await fetch("/api/chats", { method: "POST" });
        if (!chatResponse.ok) throw new Error("Could not create a chat for this PDF.");
        const chat: Chat = await chatResponse.json();
        targetChatId = chat.id;
        setChats(current => [chat, ...current]);
        setChatId(chat.id);
      }
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/uploads?chatId=${encodeURIComponent(targetChatId)}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed.");
      setUploads(current => [data, ...current]);
      setNotice(`${file.name} is ready in this chat. It will not be included in other chats.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeUpload(upload: UploadItem) {
    if (!chatId) return;
    setError("");
    try {
      const response = await fetch(
        `/api/uploads/${encodeURIComponent(upload.id)}?chatId=${encodeURIComponent(chatId)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not remove this PDF.");
      setUploads(current => current.filter(item => item.id !== upload.id));
      setNotice(`${upload.filename} was removed from this chat.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this PDF.");
    }
  }

  async function logout() {
    if (voiceOpen) setVoiceOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setChats([]);
    setChatId("");
    setMessages([]);
    setUploads([]);
    setAnswer(null);
  }

  async function startVoice() {
    setError("");
    let selectedChat = chatId;
    if (!selectedChat) {
      const response = await fetch("/api/chats", { method: "POST" });
      if (!response.ok) {
        setError("Could not create a chat for voice mode.");
        return;
      }
      const chat: Chat = await response.json();
      selectedChat = chat.id;
      setChatId(chat.id);
      setChats(current => [chat, ...current]);
    }
    setVoiceOpen(true);
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#e0f2fe,_#f8fafc_55%)] px-5 py-10 text-slate-900">
        <section className="w-full max-w-md rounded-[2rem] border border-white bg-white/90 p-8 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.22)] backdrop-blur sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-cyan-700 text-white shadow-lg shadow-cyan-700/20">
              <MessageSquareText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Cedarhaven</h1>
              <p className="text-sm text-slate-500">Your private guide assistant</p>
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(["login", "signup"] as const).map(value => (
              <button
                key={value}
                type="button"
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => { setMode(value); setError(""); }}
              >
                {value === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <form onSubmit={authenticate} className="grid gap-4">
            {mode === "signup" && <>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">Name
                <input required maxLength={100} value={name} onChange={event => setName(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" autoComplete="name" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">Mobile number <span className="font-normal text-slate-400">optional</span>
                <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" autoComplete="tel" />
              </label>
            </>}
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">Gmail address
              <input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" autoComplete="email" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">Password
              <input required minLength={mode === "signup" ? 12 : 1} maxLength={128} type="password" value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </label>
            {mode === "signup" && <label className="grid gap-1.5 text-sm font-medium text-slate-700">Confirm password
              <input required minLength={12} maxLength={128} type="password" value={confirm} onChange={event => setConfirm(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" autoComplete="new-password" />
            </label>}
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button disabled={busy} className="mt-1 rounded-xl bg-cyan-800 px-4 py-3.5 font-semibold text-white shadow-lg shadow-cyan-900/15 transition hover:bg-cyan-900 disabled:opacity-50">
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
          <div className="mt-6 flex items-start gap-2 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-700" />
            <p>{mode === "signup" ? "Use at least 12 characters. No email verification is required." : "Your chats and uploaded documents stay private to your account."}</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-dvh min-h-0 overflow-hidden bg-slate-50 text-slate-900">
      {mobileHistoryOpen && (
        <button aria-label="Close chat history" className="fixed inset-0 z-30 bg-slate-900/20 md:hidden" onClick={() => setMobileHistoryOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex min-h-0 w-[min(300px,85vw)] shrink-0 flex-col border-r border-slate-200 bg-white p-4 shadow-xl transition-transform md:static md:z-auto md:w-72 md:translate-x-0 md:shadow-none ${mobileHistoryOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-800 text-white"><MessageSquareText size={19} /></div>
            <div><div className="font-bold tracking-tight">Cedarhaven</div><div className="text-xs text-slate-500">Guide assistant</div></div>
          </div>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={() => setMobileHistoryOpen(false)} aria-label="Close history"><X size={18} /></button>
        </div>
        <button onClick={createChat} className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-cyan-800 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-900"><Plus size={17} />New chat</button>
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Recent conversations</div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {loadingHistory && <p className="px-3 py-3 text-xs text-slate-400">Loading saved chats…</p>}
          {!loadingHistory && chats.length === 0 && <p className="px-3 py-3 text-xs leading-5 text-slate-400">Your conversations will appear here.</p>}
          {chats.map(chat => (
            <button key={chat.id} onClick={() => { setChatId(chat.id); setMobileHistoryOpen(false); }} className={`w-full truncate rounded-xl px-3 py-2.5 text-left text-sm transition ${chatId === chat.id ? "bg-cyan-50 font-medium text-cyan-900" : "text-slate-600 hover:bg-slate-50"}`}>
              {chat.title}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRound size={17} /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-xs text-slate-500">{user.email}</div></div>
            <button onClick={logout} title="Sign out" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileHistoryOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open chat history"><Menu size={19} /></button>
            <div className="min-w-0"><h1 className="truncate text-sm font-semibold md:text-base">{chats.find(chat => chat.id === chatId)?.title || "Document assistant"}</h1><p className="hidden text-xs text-slate-500 sm:block">Evidence-grounded answers from your guides and PDFs</p></div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={upload} className="hidden" />
            <button disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 disabled:opacity-50"><Upload size={16} /><span className="hidden sm:inline">Upload PDF</span></button>
            <button onClick={() => void startVoice()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-800 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-900"><Mic size={16} /><span className="hidden sm:inline">Voice</span></button>
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={logout} title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>
        <div className="border-b border-slate-100 bg-white px-4 py-2.5 text-xs text-slate-500 md:px-8">
          Private to your account · saved chat history is used as context for follow-up questions.
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-4 py-7 md:px-8">
              {messages.length === 0 && (
                <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-sm sm:mt-20 sm:p-10">
                  <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-800"><FileText size={25} /></div>
                  <h2 className="text-2xl font-semibold tracking-tight">Ask with confidence</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Ask about the Cedarhaven guides or upload a PDF. Answers stay tied to relevant source passages, and this chat remembers its own history.</p>
                  <button onClick={() => void startVoice()} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100"><Mic size={16} />Start a voice chat</button>
                </div>
              )}
              {messages.map((message, index) => (
                <article key={`${index}-${message.role}`} className={`min-w-0 w-fit max-w-[min(100%,48rem)] rounded-2xl px-4 py-4 sm:px-5 ${message.role === "user" ? "ml-auto bg-cyan-800 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-800 shadow-sm"}`}>
                  <div className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${message.role === "user" ? "text-cyan-100/80" : "text-slate-400"}`}>{message.role === "user" ? "You" : "Cedarhaven assistant"}</div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{message.content}</p>
                  {message.sources?.map((source, sourceIndex) => (
                    <details key={source.id || sourceIndex} className={`mt-3 min-w-0 max-w-full rounded-xl border p-3 ${message.role === "user" ? "border-white/20" : "border-slate-200 bg-slate-50"}`}>
                      <summary className={`cursor-pointer break-words text-xs font-medium [overflow-wrap:anywhere] ${message.role === "user" ? "text-cyan-50" : "text-cyan-800"}`}>{source.citation || "View evidence"}</summary>
                      {source.quotes.map((quote, quoteIndex) => <blockquote key={quoteIndex} className="mt-2 break-words border-l-2 border-cyan-600 pl-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{quote}</blockquote>)}
                    </details>
                  ))}
                </article>
              ))}
              {busy && <div className="mx-auto max-w-3xl animate-pulse text-sm text-slate-400">Checking the relevant passages…</div>}
            </div>

            <div className="mx-auto w-full max-w-4xl px-4 pb-4 md:px-8">
              {uploads.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{uploads.map(upload => <span key={upload.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"><Paperclip size={12} className="shrink-0 text-cyan-800" /><span className="max-w-[220px] truncate">{upload.filename}</span><button type="button" aria-label={`Remove ${upload.filename}`} title="Remove PDF from this chat" onClick={() => void removeUpload(upload)} className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><X size={13} /></button></span>)}</div>}
              {notice && <p className="mb-2 text-sm text-emerald-700">{notice}</p>}
              {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              <form onSubmit={sendQuestion} className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-600/10">
                <textarea value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} placeholder="Ask a question about your guides or PDFs…" rows={1} maxLength={800} className="max-h-40 min-h-11 flex-1 resize-y bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
                <button type="submit" disabled={busy || !question.trim()} title="Send" className="rounded-xl bg-cyan-800 p-3 text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-40"><Send size={18} /></button>
              </form>
              <div className="mt-2 text-center text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</div>
            </div>
          </div>
          {answer && <aside className="hidden w-[340px] shrink-0 border-l border-slate-200 bg-white p-4 xl:block"><EvidenceView latest={answer} count={messages.length} /></aside>}
        </div>
      </section>
      {voiceOpen && chatId && (
        <InlineVoiceCall
          appConfig={appConfig}
          chatId={chatId}
          onClose={() => void closeVoiceCall()}
          onHistoryUpdate={handleVoiceHistoryUpdate}
        />
      )}
    </main>
  );
}
