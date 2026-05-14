import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Minus, X, SmilePlus, Send, Maximize2, LogOut, AlertTriangle } from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const emojiGroups = {
  常用: ["😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "😭", "😅", "👍", "🙏", "👏", "🔥", "❤️", "💔", "✨", "💯"],
  微信感: ["[微笑]", "[捂脸]", "[呲牙]", "[偷笑]", "[流泪]", "[大哭]", "[发怒]", "[疑问]", "[困]", "[赞]", "[握手]", "[抱拳]"],
  动物: ["🐶", "🐱", "🐰", "🐼", "🐷", "🐸", "🐥", "🦊", "🐻", "🐨"],
};

function getSavedProfile() {
  try {
    const saved = window.localStorage.getItem("miniChatProfile");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function getClientId() {
  try {
    const saved = window.localStorage.getItem("miniChatClientId");
    if (saved) return saved;
    const next = crypto.randomUUID();
    window.localStorage.setItem("miniChatClientId", next);
    return next;
  } catch {
    return `client-${Date.now()}`;
  }
}

function cleanRoomCode(value) {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "office-chat";
}

function formatMessageTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TwoPersonMiniChatApp() {
  const [profile, setProfile] = useState(getSavedProfile);
  const [clientId] = useState(getClientId);
  const [nickname, setNickname] = useState(profile?.name || "");
  const [roomCode, setRoomCode] = useState(profile?.room || "office-chat");
  const [isOpen, setIsOpen] = useState(true);
  const [compact, setCompact] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const bottomRef = useRef(null);

  const unread = useMemo(() => messages.filter((m) => m.client_id !== clientId).length, [messages, clientId]);

  const appendMessage = (message) => {
    if (!message?.id || seenIdsRef.current.has(message.id)) return;
    seenIdsRef.current.add(message.id);
    setMessages((prev) => [...prev, message].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!profile || !supabase) return;

    let isMounted = true;
    seenIdsRef.current = new Set();
    setMessages([]);
    setLoading(true);
    setErrorMessage("");

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, room_code, nickname, body, client_id, created_at")
        .eq("room_code", profile.room)
        .order("created_at", { ascending: true })
        .limit(100);

      if (!isMounted) return;

      if (error) {
        setErrorMessage(`读取消息失败：${error.message}`);
        setLoading(false);
        return;
      }

      const nextMessages = data || [];
      seenIdsRef.current = new Set(nextMessages.map((item) => item.id));
      setMessages(nextMessages);
      setLoading(false);
    };

    loadMessages();

    const channel = supabase
      .channel(`room:${profile.room}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_code=eq.${profile.room}`,
        },
        (payload) => {
          appendMessage(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setErrorMessage("");
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [profile, clientId]);

  const enterChat = () => {
    const cleanName = nickname.trim();
    const cleanRoom = cleanRoomCode(roomCode);
    if (!cleanName) return;

    const nextProfile = {
      name: cleanName,
      room: cleanRoom,
    };

    window.localStorage.setItem("miniChatProfile", JSON.stringify(nextProfile));
    setRoomCode(cleanRoom);
    setProfile(nextProfile);
  };

  const leaveChat = () => {
    window.localStorage.removeItem("miniChatProfile");
    setProfile(null);
    setMessages([]);
    setInput("");
    setShowEmoji(false);
    setErrorMessage("");
  };

  const sendMessage = async () => {
    const clean = input.trim();
    if (!clean || !profile) return;

    if (!supabase) {
      setErrorMessage("还没有配置 Supabase。请先创建 .env.local 并重启 npm run dev。");
      return;
    }

    setInput("");
    setShowEmoji(false);
    setErrorMessage("");

    const { error } = await supabase.from("messages").insert({
      room_code: profile.room,
      nickname: profile.name,
      body: clean,
      client_id: clientId,
    });

    if (error) {
      setErrorMessage(`发送失败：${error.message}`);
      setInput(clean);
    }
  };

  const insertEmoji = (emoji) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-[380px] rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
              <MessageCircle size={22} />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-950">进入私密聊天</div>
              <div className="mt-1 text-sm text-slate-500">两个人输入同一个房间码即可聊天</div>
            </div>
          </div>

          {!supabase && (
            <div className="mb-4 flex gap-2 rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>还没有配置 Supabase。配置完成后，这里就会变成真正的实时聊天。</div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">你的昵称</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enterChat();
                }}
                placeholder="例如：Julie"
                className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm outline-none focus:bg-slate-50 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">房间码</label>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enterChat();
                }}
                placeholder="例如：office-chat"
                className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm outline-none focus:bg-slate-50 focus:ring-2 focus:ring-slate-200"
              />
              <p className="mt-2 text-xs leading-relaxed text-slate-400">房间码建议只用英文、数字、短横线或下划线。</p>
            </div>

            <button
              onClick={enterChat}
              disabled={!nickname.trim()}
              className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              进入聊天
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-end justify-end">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen(true)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl"
        >
          <MessageCircle size={24} />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold">
            {unread}
          </span>
        </motion.button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4 flex items-end justify-end">
      <motion.div
        layout
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`${compact ? "w-[260px]" : "w-[380px]"} overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-2xl backdrop-blur-xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-950 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center">
              <MessageCircle size={18} />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-950 bg-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-none">{profile.name}</div>
              <div className="mt-1 truncate text-xs text-white/60">房间：{profile.room}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCompact((v) => !v)}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
              title="切换小窗口"
            >
              <Maximize2 size={15} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
              title="最小化"
            >
              <Minus size={15} />
            </button>
            <button
              onClick={leaveChat}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
              title="换昵称 / 退出"
            >
              <LogOut size={15} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
              title="关闭"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className={`${compact ? "h-[280px]" : "h-[430px]"} overflow-y-auto bg-[#f5f5f5] px-4 py-4`}> 
          <div className="mb-4 text-center text-[11px] text-slate-400">今天</div>

          {loading && <div className="text-center text-xs text-slate-400">正在加载消息...</div>}

          {errorMessage && (
            <div className="mb-3 rounded-2xl bg-red-50 p-3 text-xs leading-relaxed text-red-600">{errorMessage}</div>
          )}

          {!loading && messages.length === 0 && (
            <div className="rounded-2xl bg-white p-4 text-center text-xs leading-relaxed text-slate-400 shadow-sm">
              当前房间还没有消息。发第一条消息试试。
            </div>
          )}

          <div className="space-y-3">
            {messages.map((message) => {
              const isMe = message.client_id === clientId;
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[78%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    <div className="text-[10px] text-slate-400 px-1">
                      {message.nickname} · {formatMessageTime(message.created_at)}
                    </div>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                        isMe
                          ? "rounded-br-md bg-[#95ec69] text-slate-950"
                          : "rounded-bl-md bg-white text-slate-900"
                      }`}
                    >
                      {message.body}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="relative border-t border-slate-100 bg-white p-3">
          <AnimatePresence>
            {showEmoji && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-[72px] left-3 right-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-xl"
              >
                {Object.entries(emojiGroups).map(([group, emojis]) => (
                  <div key={group} className="mb-3 last:mb-0">
                    <div className="mb-2 text-xs font-medium text-slate-400">{group}</div>
                    <div className="grid grid-cols-8 gap-1">
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => insertEmoji(emoji)}
                          className="rounded-xl px-1 py-1.5 text-lg hover:bg-slate-100"
                        >
                          <span className="text-sm">{emoji}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowEmoji((v) => !v)}
              className="mb-1 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <SmilePlus size={20} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              placeholder="输入消息..."
              className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl bg-slate-100 px-3 py-2.5 text-sm outline-none focus:bg-slate-50 focus:ring-2 focus:ring-slate-200"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="mb-1 rounded-full bg-slate-950 p-2.5 text-white shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
