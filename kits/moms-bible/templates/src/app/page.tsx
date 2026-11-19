"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Search,
  Heart,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Home,
  X,
  Trash2,
  Moon,
  Sun,
} from "lucide-react";
import { db, type Bookmark } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";

type BibleBook = { id: string; name: string; chapters: number; testament: string };
type Verse = { verse: number; text: string };
type ChapterData = { book: string; chapters: { [key: string]: Verse[] } };

// Daily verses — rotates based on day of year
const DAILY_VERSES = [
  { book: "psalms", chapter: 23, verse: 1, ref: "Psalm 23:1", text: "The Lord is my shepherd; I shall not want." },
  { book: "john", chapter: 3, verse: 16, ref: "John 3:16", text: "For God so loved the world, that he gave his only begotten Son..." },
  { book: "proverbs", chapter: 3, verse: 5, ref: "Proverbs 3:5", text: "Trust in the Lord with all thine heart; and lean not unto thine own understanding." },
  { book: "philippians", chapter: 4, verse: 13, ref: "Philippians 4:13", text: "I can do all things through Christ which strengtheneth me." },
  { book: "isaiah", chapter: 40, verse: 31, ref: "Isaiah 40:31", text: "But they that wait upon the Lord shall renew their strength..." },
  { book: "romans", chapter: 8, verse: 28, ref: "Romans 8:28", text: "And we know that all things work together for good to them that love God..." },
  { book: "psalms", chapter: 46, verse: 10, ref: "Psalm 46:10", text: "Be still, and know that I am God..." },
  { book: "matthew", chapter: 11, verse: 28, ref: "Matthew 11:28", text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
  { book: "psalms", chapter: 91, verse: 1, ref: "Psalm 91:1", text: "He that dwelleth in the secret place of the most High shall abide under the shadow of the Almighty." },
  { book: "jeremiah", chapter: 29, verse: 11, ref: "Jeremiah 29:11", text: "For I know the thoughts that I think toward you, saith the Lord, thoughts of peace..." },
];

export default function BibleApp() {
  const [view, setView] = useState<"home" | "read" | "search" | "bookmarks" | "settings">("home");
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [currentBook, setCurrentBook] = useState<string>("");
  const [currentChapter, setCurrentChapter] = useState<number>(1);
  const [chapterContent, setChapterContent] = useState<Verse[]>([]);
  const [fontSize, setFontSize] = useState<number>(24);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<"book" | "chapter" | "verse">("book");
  const [pickerBook, setPickerBook] = useState<BibleBook | null>(null);
  const [pickerFilter, setPickerFilter] = useState<"all" | "OT" | "NT">("all");
  const [pickerChapter, setPickerChapter] = useState<number>(1);
  const [pickerVerses, setPickerVerses] = useState<Verse[]>([]);
  const [versePickerMode, setVersePickerMode] = useState<"grid" | "preview">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ bookId: string; book: string; chapter: number; verse: number; text: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ownerName, setOwnerName] = useState("");
  // Gates the save effect: stays false until the persisted settings have been
  // read back, so an early interaction (opening a book before the async restore
  // resolves) can't overwrite saved settings — the owner's name in particular —
  // with the empty defaults.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [longPressVerse, setLongPressVerse] = useState<number | null>(null);
  const [scrollToVerse, setScrollToVerse] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verseRefs = useRef<Map<number, HTMLElement>>(new Map());
  const mainRef = useRef<HTMLElement>(null);

  const bookmarks = useLiveQuery(() => db.bookmarks.orderBy("timestamp").reverse().toArray());
  const currentBookObj = books.find((b) => b.id === currentBook);
  const maxChapter = currentBookObj?.chapters || 1;
  const appTitle = ownerName ? `${ownerName.split(" ")[0]}'s Bible` : "Mom's Bible";
  const dailyVerse = DAILY_VERSES[Math.floor(Date.now() / 86400000) % DAILY_VERSES.length];

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Load books
  useEffect(() => {
    fetch("/data/bibles/en/kjv/books.json").then((r) => r.json()).then(setBooks);
  }, []);

  // Restore settings on mount, then open the save gate.
  useEffect(() => {
    db.settings.get(1).then((s) => {
      if (s) {
        if (s.lastBook) setCurrentBook(s.lastBook);
        if (s.lastChapter) setCurrentChapter(s.lastChapter);
        if (s.fontSize) setFontSize(s.fontSize);
        if (s.theme) setTheme(s.theme);
        if (s.ownerName) setOwnerName(s.ownerName);
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  // Load chapter content
  useEffect(() => {
    if (!currentBook) return;
    setLoading(true);
    fetch(`/data/bibles/en/kjv/book/${currentBook}.json`)
      .then((r) => r.json())
      .then((data: ChapterData) => {
        setChapterContent(data.chapters[currentChapter.toString()] || []);
        setLoading(false);
      })
      .catch(() => { setChapterContent([]); setLoading(false); });
  }, [currentBook, currentChapter]);

  // Save settings — only once the restore has run, so the owner's name persists
  // even before a book is opened and is never clobbered by the mount race.
  useEffect(() => {
    if (!settingsLoaded) return;
    db.settings.put({ id: 1, fontSize, theme, lastBook: currentBook, lastChapter: currentChapter, ownerName });
  }, [settingsLoaded, currentBook, currentChapter, fontSize, theme, ownerName]);

  // Scroll to verse after navigation — wait for DOM render
  useEffect(() => {
    if (scrollToVerse === null || loading || chapterContent.length === 0) return;
    const target = scrollToVerse;
    // Use requestAnimationFrame + setTimeout to ensure DOM is painted
    const raf = requestAnimationFrame(() => {
      setTimeout(() => {
        const el = verseRefs.current.get(target);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-accent");
          setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 2500);
        }
        setScrollToVerse(null);
      }, 300);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToVerse, loading, chapterContent]);

  const navigateTo = (bookId: string, chapter: number, verse?: number) => {
    setCurrentBook(bookId);
    setCurrentChapter(chapter);
    if (verse) setScrollToVerse(verse);
    setView("read");
  };

  const prevChapter = () => {
    if (currentChapter > 1) { setCurrentChapter(currentChapter - 1); }
    else {
      const idx = books.findIndex((b) => b.id === currentBook);
      if (idx > 0) { setCurrentBook(books[idx - 1].id); setCurrentChapter(books[idx - 1].chapters); }
    }
  };

  const nextChapter = () => {
    if (currentChapter < maxChapter) { setCurrentChapter(currentChapter + 1); }
    else {
      const idx = books.findIndex((b) => b.id === currentBook);
      if (idx < books.length - 1) { setCurrentBook(books[idx + 1].id); setCurrentChapter(1); }
    }
  };

  // Long press to bookmark (500ms)
  const onVersePointerDown = (verse: number, text: string) => {
    longPressTimer.current = setTimeout(async () => {
      setLongPressVerse(verse);
      const existing = await db.bookmarks.where({ book: currentBook, chapter: currentChapter, verse }).first();
      if (existing) {
        await db.bookmarks.delete(existing.id!);
      } else {
        await db.bookmarks.add({ book: currentBook, chapter: currentChapter, verse, text: text.substring(0, 200), timestamp: Date.now() });
      }
      setTimeout(() => setLongPressVerse(null), 1200);
    }, 500);
  };
  const onVersePointerUp = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const isBookmarked = useCallback(
    (verse: number) => bookmarks?.some((b) => b.book === currentBook && b.chapter === currentChapter && b.verse === verse) || false,
    [bookmarks, currentBook, currentChapter]
  );

  const clearAllBookmarks = async () => { await db.bookmarks.clear(); setShowClearConfirm(false); };

  const doSearch = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearching(true); setSearchResults([]);
    const results: typeof searchResults = [];
    const q = searchQuery.toLowerCase();
    for (const book of books) {
      try {
        const r = await fetch(`/data/bibles/en/kjv/book/${book.id}.json`);
        if (!r.ok) continue;
        const data: ChapterData = await r.json();
        for (const [ch, verses] of Object.entries(data.chapters)) {
          for (const v of verses) {
            if (v.text.toLowerCase().includes(q)) {
              results.push({ bookId: book.id, book: book.name, chapter: parseInt(ch), verse: v.verse, text: v.text });
              if (results.length >= 50) break;
            }
          }
          if (results.length >= 50) break;
        }
      } catch {}
      if (results.length >= 50) break;
    }
    setSearchResults(results); setSearching(false);
  };

  const openPicker = (filter: "all" | "OT" | "NT" = "all") => { setPickerStep("book"); setPickerBook(null); setPickerFilter(filter); setPickerVerses([]); setShowPicker(true); };

  const selectPickerChapter = async (ch: number) => {
    if (!pickerBook) return;
    setPickerChapter(ch);
    setPickerStep("verse");
    setVersePickerMode("grid");
    try {
      const r = await fetch(`/data/bibles/en/kjv/book/${pickerBook.id}.json`);
      const data: ChapterData = await r.json();
      setPickerVerses(data.chapters[ch.toString()] || []);
    } catch { setPickerVerses([]); }
  };

  const otBooks = books.filter((b) => b.testament === "OT");
  const ntBooks = books.filter((b) => b.testament === "NT");

  return (
    <div className="flex flex-col h-[100dvh] mx-auto bg-surface text-ink overflow-hidden max-w-2xl">
      {/* Header — only in read view */}
      {view === "read" && currentBook && (
        <header className="px-3 py-2 border-b border-edge flex justify-between items-center bg-card shadow-sm shrink-0 safe-top">
          <div className="flex items-center gap-1 min-w-0">
            <button onClick={prevChapter} className="p-2 rounded-full active:bg-edge shrink-0"><ChevronLeft size={24} /></button>
            <button onClick={() => openPicker()} className="text-lg font-bold truncate px-1 py-1 rounded-lg active:bg-edge">
              {currentBookObj?.name} {currentChapter}
            </button>
            <button onClick={nextChapter} className="p-2 rounded-full active:bg-edge shrink-0"><ChevronRight size={24} /></button>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setFontSize((s) => Math.min(s + 2, 40))} className="px-2 py-1 bg-edge rounded-lg text-sm font-bold active:opacity-70">A+</button>
            <button onClick={() => setFontSize((s) => Math.max(s - 2, 16))} className="px-2 py-1 bg-edge rounded-lg text-sm font-bold active:opacity-70">A-</button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain">
        {/* HOME */}
        {view === "home" && (
          <div className="p-5 space-y-5">
            <div className="text-center pt-4 pb-2">
              <p className="text-3xl font-bold">{appTitle}</p>
              <p className="text-muted mt-1">King James Version</p>
            </div>

            {/* Daily Verse */}
            <button onClick={() => navigateTo(dailyVerse.book, dailyVerse.chapter, dailyVerse.verse)} className="block w-full text-left p-5 bg-card rounded-2xl shadow-sm border border-edge">
              <p className="text-sm font-bold text-accent mb-2">Verse of the Day</p>
              <p className="italic text-lg leading-relaxed">&ldquo;{dailyVerse.text}&rdquo;</p>
              <p className="text-muted text-sm mt-2">&mdash; {dailyVerse.ref}</p>
            </button>

            {/* Continue Reading */}
            {currentBook && (
              <button onClick={() => setView("read")} className="block w-full text-left p-5 bg-card rounded-2xl shadow-sm border border-edge">
                <p className="text-sm font-bold text-accent mb-1">Continue Reading</p>
                <p className="text-lg font-bold">{currentBookObj?.name} {currentChapter}</p>
              </button>
            )}

            {/* Browse Testaments */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => openPicker("OT")} className="p-5 bg-card rounded-2xl shadow-sm border border-edge text-center">
                <BookOpen size={32} className="mx-auto mb-2 text-accent" />
                <p className="font-bold">Old Testament</p>
                <p className="text-muted text-sm">39 Books</p>
              </button>
              <button onClick={() => openPicker("NT")} className="p-5 bg-card rounded-2xl shadow-sm border border-edge text-center">
                <BookOpen size={32} className="mx-auto mb-2 text-accent" />
                <p className="font-bold">New Testament</p>
                <p className="text-muted text-sm">27 Books</p>
              </button>
            </div>
          </div>
        )}

        {/* READ */}
        {view === "read" && (
          <div className="p-4" style={{ fontSize: `${fontSize}px`, lineHeight: "1.8" }}>
            {loading ? (
              <p className="text-center text-muted mt-20 animate-pulse">Loading...</p>
            ) : chapterContent.length > 0 ? (
              <>
                <p className="text-xs text-muted font-sans text-center mb-3 opacity-60">Hold a verse to save it</p>
                {chapterContent.map((v) => (
                  <p
                    key={v.verse}
                    ref={(el) => { if (el) verseRefs.current.set(v.verse, el); }}
                    onPointerDown={() => onVersePointerDown(v.verse, v.text)}
                    onPointerUp={onVersePointerUp}
                    onPointerLeave={onVersePointerUp}
                    className={`mb-2 rounded-lg px-2 py-1 transition-all select-none ${isBookmarked(v.verse) ? "bg-saved border-l-4 border-saved-border" : ""}`}
                  >
                    <sup className="text-xs mr-1 text-muted font-sans font-bold">{v.verse}</sup>
                    {v.text}
                    {isBookmarked(v.verse) && <span className="ml-1 text-sm inline-block" title="Saved">&#10084;&#65039;</span>}
                    {longPressVerse === v.verse && isBookmarked(v.verse) && (
                      <span className="ml-1 text-sm animate-bounce inline-block">&#10084;&#65039; Saved!</span>
                    )}
                    {longPressVerse === v.verse && !isBookmarked(v.verse) && (
                      <span className="ml-1 text-sm animate-bounce inline-block">Removed</span>
                    )}
                  </p>
                ))}
                <div className="flex justify-between items-center mt-6 pb-2">
                  <button onClick={prevChapter} className="flex items-center gap-1 px-3 py-2 bg-card rounded-xl shadow-sm font-bold text-sm active:opacity-70 border border-edge">
                    <ChevronLeft size={18} /> Prev
                  </button>
                  <span className="text-muted font-sans text-xs">{currentChapter} of {maxChapter}</span>
                  <button onClick={nextChapter} className="flex items-center gap-1 px-3 py-2 bg-card rounded-xl shadow-sm font-bold text-sm active:opacity-70 border border-edge">
                    Next <ChevronRight size={18} />
                  </button>
                </div>
              </>
            ) : !currentBook ? (
              <div className="text-center mt-20 space-y-4">
                <BookOpen size={64} className="mx-auto text-muted opacity-30" />
                <p className="text-muted">Select a book to begin.</p>
              </div>
            ) : (
              <p className="text-center text-muted mt-20">No content available for this chapter.</p>
            )}
          </div>
        )}

        {/* SEARCH */}
        {view === "search" && (
          <div className="p-5 space-y-4">
            <p className="text-2xl font-bold">Search</p>
            <div className="flex gap-2">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="e.g. grace, love, faith" className="flex-1 p-3 border border-edge rounded-xl text-lg bg-card" />
              <button onClick={doSearch} className="px-5 py-3 bg-accent text-white rounded-xl font-bold active:opacity-80">Go</button>
            </div>
            {searching && <p className="text-center text-muted animate-pulse">Searching...</p>}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted font-sans">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => navigateTo(r.bookId, r.chapter, r.verse)} className="block w-full text-left p-3 bg-card rounded-xl border border-edge">
                    <p className="font-bold text-accent text-sm">{r.book} {r.chapter}:{r.verse}</p>
                    <p className="text-ink text-sm mt-1">{r.text.substring(0, 120)}{r.text.length > 120 ? "..." : ""}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOOKMARKS */}
        {view === "bookmarks" && (
          <div className="p-5 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-2xl font-bold">Saved Verses</p>
              {bookmarks && bookmarks.length > 0 && (
                <button onClick={() => setShowClearConfirm(true)} className="text-sm text-red-500 font-bold px-3 py-1 rounded-lg active:bg-red-50">
                  Clear All
                </button>
              )}
            </div>
            {bookmarks && bookmarks.length > 0 ? (
              bookmarks.map((bm) => {
                const bookObj = books.find((b) => b.id === bm.book);
                return (
                  <div key={bm.id} className="p-4 bg-card rounded-xl border border-edge">
                    <div className="flex justify-between items-start">
                      <button onClick={() => navigateTo(bm.book, bm.chapter, bm.verse)} className="text-left flex-1">
                        <p className="font-bold text-accent">{bookObj?.name} {bm.chapter}:{bm.verse}</p>
                        {bm.text && <p className="text-muted text-sm mt-1 italic">&ldquo;{bm.text.substring(0, 100)}{bm.text.length > 100 ? "..." : ""}&rdquo;</p>}
                      </button>
                      <button onClick={() => db.bookmarks.delete(bm.id!)} className="p-2 text-muted active:text-red-500 shrink-0"><Trash2 size={18} /></button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center mt-16 space-y-3">
                <Heart size={48} className="mx-auto text-muted opacity-30" />
                <p className="text-muted text-lg">No saved verses yet.</p>
                <p className="text-muted text-sm">Press and hold any verse to save it.</p>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {view === "settings" && (
          <div className="p-5 space-y-5">
            <p className="text-2xl font-bold">Settings</p>

            {/* Owner Name */}
            <div className="p-4 bg-card rounded-xl border border-edge space-y-3">
              <p className="font-bold text-lg">Owner Name</p>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Taiwo Adeniji" className="w-full p-3 border border-edge rounded-xl text-lg bg-surface" />
              {ownerName && <p className="text-muted text-sm">App will show as: <strong>{ownerName.split(" ")[0]}&apos;s Bible</strong></p>}
            </div>

            {/* Theme */}
            <div className="p-4 bg-card rounded-xl border border-edge">
              <p className="font-bold text-lg mb-3">Display</p>
              <div className="flex gap-3">
                <button onClick={() => setTheme("light")} className={`flex-1 p-3 rounded-xl font-bold flex items-center justify-center gap-2 ${theme === "light" ? "bg-accent text-white" : "bg-edge"}`}>
                  <Sun size={20} /> Light
                </button>
                <button onClick={() => setTheme("dark")} className={`flex-1 p-3 rounded-xl font-bold flex items-center justify-center gap-2 ${theme === "dark" ? "bg-accent text-white" : "bg-edge"}`}>
                  <Moon size={20} /> Dark
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="p-4 bg-card rounded-xl border border-edge space-y-3">
              <p className="font-bold text-lg">Text Size</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setFontSize((s) => Math.max(s - 2, 16))} className="flex-1 p-3 bg-edge rounded-xl font-bold active:opacity-70">Smaller</button>
                <span className="text-xl font-bold w-12 text-center">{fontSize}</span>
                <button onClick={() => setFontSize((s) => Math.min(s + 2, 40))} className="flex-1 p-3 bg-edge rounded-xl font-bold active:opacity-70">Bigger</button>
              </div>
              <p className="text-center" style={{ fontSize: `${fontSize}px` }}>Preview text</p>
            </div>

            {/* About */}
            <div className="p-4 bg-card rounded-xl border border-edge space-y-2">
              <p className="font-bold text-lg">About</p>
              <p className="text-muted">Mom&apos;s Bible Kit v1.2</p>
              <p className="text-muted">Powered by <strong>jengaKIT</strong> &copy; {new Date().getFullYear()}</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation — always visible, safe area aware */}
      <nav className="border-t border-edge bg-card flex justify-around py-2 shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <NavBtn active={view === "home"} onClick={() => setView("home")} icon={<Home size={26} />} label="Home" />
        <NavBtn active={view === "read"} onClick={() => { if (!currentBook && books.length) { setCurrentBook("psalms"); setCurrentChapter(23); } setView("read"); }} icon={<BookOpen size={26} />} label="Read" />
        <NavBtn active={view === "search"} onClick={() => setView("search")} icon={<Search size={26} />} label="Search" />
        <NavBtn active={view === "bookmarks"} onClick={() => setView("bookmarks")} icon={<Heart size={26} />} label="Saved" />
        <NavBtn active={view === "settings"} onClick={() => setView("settings")} icon={<SettingsIcon size={26} />} label="Settings" />
      </nav>

      {/* Book/Chapter Picker */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/50 z-20 flex items-end sm:items-center justify-center">
          <div className="bg-card w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85dvh] flex flex-col">
            <div className="p-4 border-b border-edge flex justify-between items-center shrink-0">
              <p className="text-lg font-bold">
                {pickerStep === "verse" ? `${pickerBook?.name} ${pickerChapter}` : pickerStep === "chapter" ? pickerBook?.name : pickerFilter === "OT" ? "Old Testament" : pickerFilter === "NT" ? "New Testament" : "Select Book"}
              </p>
              <button onClick={() => setShowPicker(false)} className="p-2 rounded-full active:bg-edge"><X size={22} /></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              {pickerStep === "book" && (
                <>
                  {(pickerFilter === "all" || pickerFilter === "OT") && (
                    <>
                      {pickerFilter === "all" && <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Old Testament</p>}
                      <div className="grid grid-cols-2 gap-2 mb-5">
                        {otBooks.map((b) => (
                          <button key={b.id} onClick={() => { setPickerBook(b); setPickerStep("chapter"); }}
                            className={`p-3 rounded-xl text-left font-semibold text-sm ${currentBook === b.id ? "bg-accent text-white" : "bg-edge active:opacity-70"}`}>{b.name}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {(pickerFilter === "all" || pickerFilter === "NT") && (
                    <>
                      {pickerFilter === "all" && <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">New Testament</p>}
                      <div className="grid grid-cols-2 gap-2">
                        {ntBooks.map((b) => (
                          <button key={b.id} onClick={() => { setPickerBook(b); setPickerStep("chapter"); }}
                            className={`p-3 rounded-xl text-left font-semibold text-sm ${currentBook === b.id ? "bg-accent text-white" : "bg-edge active:opacity-70"}`}>{b.name}</button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {pickerStep === "chapter" && pickerBook && (
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: pickerBook.chapters }, (_, i) => i + 1).map((ch) => (
                    <button key={ch} onClick={() => selectPickerChapter(ch)}
                      className={`p-3 rounded-xl text-center font-bold ${currentBook === pickerBook.id && currentChapter === ch ? "bg-accent text-white" : "bg-edge active:opacity-70"}`}>{ch}</button>
                  ))}
                </div>
              )}
              {pickerStep === "verse" && pickerBook && (
                <div className="space-y-3">
                  <button onClick={() => { navigateTo(pickerBook.id, pickerChapter); setShowPicker(false); }}
                    className="w-full p-3 bg-accent text-white rounded-xl font-bold active:opacity-80">
                    Read Full Chapter {pickerChapter}
                  </button>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted font-sans uppercase tracking-wider">Pick a verse:</p>
                    <button onClick={() => setVersePickerMode(versePickerMode === "grid" ? "preview" : "grid")}
                      className="text-xs font-bold text-accent px-2 py-1 rounded-lg active:opacity-70">
                      {versePickerMode === "grid" ? "Show Previews" : "Number Grid"}
                    </button>
                  </div>
                  {pickerVerses.length > 0 ? (
                    versePickerMode === "grid" ? (
                      <div className="grid grid-cols-5 gap-2">
                        {pickerVerses.map((v) => (
                          <button key={v.verse} onClick={() => { navigateTo(pickerBook.id, pickerChapter, v.verse); setShowPicker(false); }}
                            className="p-3 rounded-xl text-center font-bold bg-edge active:opacity-70">{v.verse}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {pickerVerses.map((v) => (
                          <button key={v.verse} onClick={() => { navigateTo(pickerBook.id, pickerChapter, v.verse); setShowPicker(false); }}
                            className="text-left p-2 bg-edge rounded-xl active:opacity-70 overflow-hidden">
                            <span className="font-bold text-accent text-sm">{v.verse}</span>
                            <span className="text-xs text-muted ml-1">{v.text.substring(0, 40)}{v.text.length > 40 ? "..." : ""}</span>
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <p className="text-muted text-center animate-pulse py-4">Loading verses...</p>
                  )}
                </div>
              )}
            </div>
            {(pickerStep === "chapter" || pickerStep === "verse") && (
              <div className="p-3 border-t border-edge shrink-0">
                <button onClick={() => setPickerStep(pickerStep === "verse" ? "chapter" : "book")} className="w-full p-3 bg-edge rounded-xl font-bold active:opacity-70">
                  {pickerStep === "verse" ? "Back to Chapters" : "Back to Books"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clear All Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-center justify-center p-6">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full space-y-4">
            <p className="text-xl font-bold">Clear All Saved Verses?</p>
            <p className="text-muted">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 p-3 bg-edge rounded-xl font-bold active:opacity-70">Cancel</button>
              <button onClick={clearAllBookmarks} className="flex-1 p-3 bg-red-500 text-white rounded-xl font-bold active:opacity-80">Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 flex-1 min-w-0 py-1 ${active ? "text-accent" : "text-muted"}`}>
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}
