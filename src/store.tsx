import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from "zustand/middleware";
import { showNotification } from "@mantine/notifications";
import * as api from './api';
import { Note, Tag, PlaylistItem, AudioActiveVerse } from './types';
import { getCachedNotes, cacheNotes, clearNotesCache } from './utils/cacheManager';

export interface Fileset {
  id: string;
  type: "text_plain" | "audio" | "audio_drama";
  size: string;
  codec: "mp3" | "opus" | null;
  bitrate: string | null;
}

export interface Translation {
  abbr: string;
  name: string;
  language: string;
  language_iso: string;
  filesets: Fileset[];
}

interface BibleState {
  activeBook: string;
  activeBookShort: string;
  activeChapter: number;
  activeVerses: number[];
  bibleVersion: string;
  showAudioPlayer: boolean;
  translations: Translation[];
  activeTextFilesetId: string | null;
  activeAudioFilesetId: string | null;
  tags: Tag[];
  notes: Note[];
  allNotesFetched: boolean;
  showNotes: boolean;
  lastSelectedTagId: string | null;
  audioActiveVerse: AudioActiveVerse | null;
  setAudioActiveVerse: (verse: AudioActiveVerse | null) => void;
  audioPlaylistItems: PlaylistItem[] | null;
  setAudioPlaylistItems: (items: PlaylistItem[] | null) => void;
  audioPlaylistStartIndex: number | null;
  setAudioPlaylistStartIndex: (index: number | null) => void;
  audioPlaylistEnded: boolean;
  setAudioPlaylistEnded: (ended: boolean) => void;
  versesFolded: boolean;
  setVersesFolded: (folded: boolean) => void;
  readingPositions: Record<
    string,
    { chapter: number; verse: number }
  >;
  setActiveBook: (activeBook: string) => void;
  setActiveBookAndChapter: (
    activeBook: string,
    activeChapter: number
  ) => void;
  setActiveBookOnly: (activeBook: string) => void;
  setActiveBookShort: (activeBookShort: string) => void;
  setActiveChapter: (activeChapter: number) => void;
  setActiveVerses: (activeVerses: number[]) => void;
  selectedVerses: number[];
  setBibleVersion: (bibleVersion: string) => void;
  setShowAudioPlayer: (show: boolean) => void;
  setTranslations: (translations: Translation[]) => void;
  setActiveTextFilesetId: (id: string | null) => void;
  setActiveAudioFilesetId: (id: string | null) => void;
  fetchNotes: (tagId?: string) => Promise<void>;
  getTags: (forceRefresh?: boolean) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  reorderNotes: (tagId: string, noteIds: string[]) => Promise<void>;
  setShowNotes: (show: boolean) => void;
  setLastSelectedTagId: (tagId: string | null) => void;
  setActiveBookWithPosition: (activeBook: string) => Promise<void>;
  syncReadingPosition: (
    book: string,
    chapter: number,
    verse?: number
  ) => Promise<void>;
  prefetchReadingPositions: () => Promise<void>;
}

// Define and export the initial state for reusability and testing
export const initialState = {
  activeBook: "John",
  activeBookShort: "Joh",
  activeChapter: 1,
  activeVerses: [],
  selectedVerses: [],
  bibleVersion: "KJV",
  showAudioPlayer: false,
  translations: [],
  activeTextFilesetId: "ENGESV_API",
  activeAudioFilesetId: "ENGESV_API",
  tags: [] as Tag[],
  notes: [] as Note[],
  allNotesFetched: false,
  showNotes: false,
  lastSelectedTagId: null,
  audioActiveVerse: null as AudioActiveVerse | null,
  audioPlaylistItems: null as PlaylistItem[] | null,
  audioPlaylistStartIndex: null as number | null,
  audioPlaylistEnded: false,
  versesFolded: false,
  readingPositions: {} as Record<
    string,
    { chapter: number; verse: number }
  >,
};

export const useBibleStore = createWithEqualityFn<BibleState>()(
  persist(
    (set) => ({
      ...initialState,
      setActiveBook: (activeBook) => set({ 
        activeBook, 
        activeChapter: 1, 
        activeVerses: [],
        audioActiveVerse: null
      }),
      setActiveBookAndChapter: (activeBook, activeChapter) =>
        set({
          activeBook,
          activeChapter,
          activeVerses: [],
        }),
      setActiveBookOnly: (activeBook) => set({ activeBook }),
      setActiveBookShort: (activeBookShort) => set({ activeBookShort }),
      setActiveChapter: (activeChapter) => set({ 
        activeChapter, 
        activeVerses: [],
      }),
      setActiveVerses: (activeVerses) => {
        set({ activeVerses });
        activeVerses.forEach((verse) => {
          document
            .getElementById("verse-" + verse)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      },
      setBibleVersion: (bibleVersion) => set({ bibleVersion }),
      setShowAudioPlayer: (showAudioPlayer) => set({ showAudioPlayer }),
      setTranslations: (translations) => set({ translations }),
      setActiveTextFilesetId: (activeTextFilesetId) =>
        set({ activeTextFilesetId }),
      setActiveAudioFilesetId: (activeAudioFilesetId) =>
        set({ activeAudioFilesetId }),
      fetchNotes: async (tagId?: string) => {
        try {
          // Check cache first
          if (tagId) {
            const cachedNotes = getCachedNotes(tagId);
            if (cachedNotes) {
              console.log(`✅ Using cached notes for tag: ${tagId} (${cachedNotes.length} notes)`);
              set({ notes: cachedNotes, allNotesFetched: false, lastSelectedTagId: tagId });
              return;
            }
          }

          // Fetch from API
          console.log(`📝 Fetching notes from API for tag: ${tagId || 'all'}`);
          const notes = await api.getNotes(tagId);

          // Cache the results
          if (tagId) {
            cacheNotes(tagId, notes);
          }

          set({ notes, allNotesFetched: !tagId, lastSelectedTagId: tagId || null });
        } catch (error) {
          console.error('Error fetching notes:', error);
          showNotification({
            title: 'Error',
            message: 'Failed to load notes. Please try again.',
            color: 'red',
          });
          throw error;
        }
      },
      getTags: async (forceRefresh = false) => {
        // Use cached tags unless force refresh
        const currentTags = useBibleStore.getState().tags;
        if (!forceRefresh && currentTags.length > 0) {
          console.log(`✅ Using cached tags (${currentTags.length} tags) - no API call`);
          return;
        }

        // Fetch from API
        console.log('📝 Fetching tags from API', new Error().stack);
        try {
          const tags = await api.getTags();
          set({ tags });
          console.log(`✅ Tags fetched successfully (${tags.length} tags)`);
        } catch (error) {
          console.error('Error fetching tags:', error);
          showNotification({
            title: 'Error',
            message: 'Failed to load tags. Please try again.',
            color: 'red',
          });
          throw error;
        }
      },
      deleteNote: async (noteId: string) => {
        try {
          await api.deleteNote(noteId);
          // Clear all notes cache since we don't know which tag this note belonged to
          clearNotesCache();
          set((state) => ({
            notes: state.notes.filter((n) => n.id !== noteId)
          }));
          showNotification({
            title: 'Success',
            message: 'Note deleted successfully',
            color: 'green',
          });
        } catch (error) {
          console.error('Error deleting note:', error);
          showNotification({
            title: 'Error',
            message: 'Failed to delete note. Please try again.',
            color: 'red',
          });
          throw error;
        }
      },
      reorderNotes: async (tagId: string, noteIds: string[]) => {
        await api.reorderNotes(tagId, noteIds);
        // Update local state to reflect new order
        set((state) => {
          const ordered = noteIds
            .map((id, i) => {
              const note = state.notes.find((n) => n.id === id);
              return note ? { ...note, tag_position: i + 1 } : null;
            })
            .filter(Boolean) as Note[];
          const rest = state.notes.filter(
            (n) => !noteIds.includes(n.id),
          );
          return { notes: [...ordered, ...rest] };
        });
      },
      setShowNotes: (showNotes) => set({ showNotes }),
      setLastSelectedTagId: (lastSelectedTagId) => set({ lastSelectedTagId }),
      setAudioActiveVerse: (audioActiveVerse) =>
        set({ audioActiveVerse }),
      setAudioPlaylistItems: (audioPlaylistItems) =>
        set({ audioPlaylistItems }),
      setAudioPlaylistStartIndex: (audioPlaylistStartIndex) =>
        set({ audioPlaylistStartIndex }),
      setAudioPlaylistEnded: (audioPlaylistEnded) =>
        set({ audioPlaylistEnded }),
      setVersesFolded: (versesFolded) => {
        set({ versesFolded });
        if (!versesFolded) {
          setTimeout(() => {
            const { activeVerses, audioActiveVerse } =
              useBibleStore.getState();
            const focusVerse =
              activeVerses[0] ?? audioActiveVerse?.verse;
            if (focusVerse != null) {
              document
                .getElementById("verse-" + focusVerse)
                ?.scrollIntoView({
                  block: "center",
                  behavior: "smooth",
                });
            }
          }, 50);
        }
      },
      setActiveBookWithPosition: async (activeBook) => {
        const state = useBibleStore.getState();
        const readingPositions = state.readingPositions || {};
        
        let position = readingPositions[activeBook];
        
        if (!position) {
          const apiPosition = await api.getReadingPosition(activeBook);
          if (apiPosition) {
            position = {
              chapter: apiPosition.chapter,
              verse: apiPosition.verse
            };
            set((currentState) => ({
              readingPositions: {
                ...(currentState.readingPositions || {}),
                [activeBook]: position!
              }
            }));
          }
        }
        
        set({
          activeBook,
          activeChapter: position?.chapter || 1,
          activeVerses: position?.verse ? [position.verse] : [],
          audioActiveVerse: null
        });
      },
      syncReadingPosition: async (
        book: string,
        chapter: number,
        verse = 1
      ) => {
        set((state) => ({
          readingPositions: {
            ...(state.readingPositions || {}),
            [book]: { chapter, verse }
          }
        }));
        
        api.updateReadingPosition(book, chapter, verse);
      },
      prefetchReadingPositions: async () => {
        try {
          const booksData = api.getBooks();
          if (!Array.isArray(booksData)) {
            console.error('getBooks() did not return an array');
            return;
          }
          
          const books = booksData.map((b) => b.book_name);
          const positions =
            await api.getBulkReadingPositions(books);
          
          const validPositions: Record<
            string,
            { chapter: number; verse: number }
          > = {};
          
          for (const book of books) {
            if (positions[book]) {
              validPositions[book] = positions[book]!;
            }
          }
          
          set({ readingPositions: validPositions });
        } catch (error) {
          console.error(
            'Error prefetching reading positions:',
            error
          );
        }
      },
    }),
    {
      name: "bible-storage",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeBook: state.activeBook,
        activeBookShort: state.activeBookShort,
        activeChapter: state.activeChapter,
        activeVerses: state.activeVerses,
        selectedVerses: state.selectedVerses,
        bibleVersion: state.bibleVersion,
        translations: state.translations,
        activeTextFilesetId: state.activeTextFilesetId,
        activeAudioFilesetId: state.activeAudioFilesetId,
        lastSelectedTagId: state.lastSelectedTagId,
        audioActiveVerse: state.audioActiveVerse,
        notes: state.notes,
        tags: state.tags,
        readingPositions: state.readingPositions,
        // showAudioPlayer is NOT persisted
      }),
      migrate: (persistedState: any, version: number) => {
        const state = persistedState || {};
        
        if (version === 0) {
          state.readingPositions = {};
        }
        
        if (
          !state.readingPositions ||
          typeof state.readingPositions !== 'object' ||
          Array.isArray(state.readingPositions)
        ) {
          state.readingPositions = {};
        }
        
        if (!Array.isArray(state.notes)) {
          state.notes = [];
        }
        
        if (!Array.isArray(state.tags)) {
          state.tags = [];
        }
        
        if (!Array.isArray(state.activeVerses)) {
          state.activeVerses = [];
        }
        
        if (!Array.isArray(state.selectedVerses)) {
          state.selectedVerses = [];
        }
        
        if (!Array.isArray(state.translations)) {
          state.translations = [];
        }
        
        return state;
      },
    }
  )
);
