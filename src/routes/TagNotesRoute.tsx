import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ScrollArea,
  Stack,
  Center,
  Text,
  Loader,
  Box,
  Group,
  Select,
  ActionIcon,
  Tooltip,
  Button,
  Alert,
} from '@mantine/core';
import {
  IconShare,
  IconRefresh,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconInfoCircle,
} from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import type { MouseEvent } from 'react';
import { Note, Tag, CommentCounts, PlaylistItem } from '../types';
import TagSection from '../components/TagSection';
import EditNoteModal from '../components/EditNoteModal';
import { useBibleStore } from '../store';
import { deleteNote, getTag, fetchCommentCounts } from '../api';
import { useAuthStore } from '../stores/authStore';
import { clearNotesCache } from '../utils/cacheManager';
import {
  BOOK_NAME_TO_ORDER,
} from '../utils/bibleUtils';

export default function TagNotesRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  
  const notesFromStore = useBibleStore((state) => state.notes);
  const notes = Array.isArray(notesFromStore) ? notesFromStore : [];
  const storedTags = useBibleStore((state) => state.tags);
  const fetchNotes = useBibleStore((state) => state.fetchNotes);
  const getTags = useBibleStore((state) => state.getTags);
  const reorderNotes = useBibleStore((state) => state.reorderNotes);
  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  const setLastSelectedTagId = useBibleStore(
    (state) => state.setLastSelectedTagId
  );
  const notesCount = useBibleStore((state) => state.notesCount);
  const notesPage = useBibleStore((state) => state.notesPage);
  const notesHasMore = useBibleStore((state) => state.notesHasMore);
  const versesFolded = useBibleStore((state) => state.versesFolded);
  const setVersesFolded = useBibleStore((state) => state.setVersesFolded);
  const setAudioPlaylistItems = useBibleStore(
    (state) => state.setAudioPlaylistItems
  );
  const setAudioPlaylistStartIndex = useBibleStore(
    (state) => state.setAudioPlaylistStartIndex
  );
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  
  type SortOrder =
    | 'custom_asc'
    | 'custom_desc'
    | 'created_desc'
    | 'created_asc'
    | 'verse_asc'
    | 'verse_desc';

  // Get sort order from URL, default to 'created_desc'
  const urlSortOrder = searchParams.get('sort') as SortOrder | null;
  const validSortOrders: SortOrder[] = [
    'custom_asc',
    'custom_desc',
    'created_desc',
    'created_asc',
    'verse_asc',
    'verse_desc',
  ];
  const sortOrder: SortOrder =
    urlSortOrder && validSortOrders.includes(urlSortOrder)
      ? urlSortOrder
      : 'created_desc';

  // Map frontend sort order to API ordering parameter
  const getApiOrdering = (sortOrder: SortOrder): string => {
    const orderingMap: Record<SortOrder, string> = {
      custom_asc: 'custom',
      custom_desc: '-custom',
      created_desc: '-created',
      created_asc: 'created',
      verse_asc: 'verse',
      verse_desc: '-verse',
    };
    return orderingMap[sortOrder];
  };
  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] =
    useState<CommentCounts>({});

  // Set showNotes to true and save lastSelectedTagId when on notes route
  useEffect(() => {
    setShowNotes(true);
    if (tagId) {
      setLastSelectedTagId(tagId);
    }
    return () => {
      setAudioPlaylistItems(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagId]);

  // Always refresh tags when navigating to this route
  useEffect(() => {
    if (isAuthenticated) {
      getTags(true); // Force refresh to get latest tags
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    const loadTagAndNotes = async () => {
      if (!tagId) {
        setError('No tag ID provided');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Preload the caller's own tags when authenticated so the tag
        // switcher works. Failures are non-fatal for shared pages.
        if (isAuthenticated) {
          try { await getTags(); } catch { /* ignore */ }
        }

        // Fetch notes with ordering if non-default sort
        const apiOrdering =
          sortOrder !== 'created_desc'
            ? getApiOrdering(sortOrder)
            : undefined;
        
        await fetchNotes(tagId, {
          ordering: apiOrdering,
          page: 1,
        });
        if (cancelled) return;

        const fetchedNotes = useBibleStore.getState().notes;
        let resolvedTag: Tag | null =
          useBibleStore.getState().tags.find((t) => t.id === tagId) ||
          fetchedNotes[0]?.tag ||
          null;

        if (!resolvedTag) {
          try {
            resolvedTag = await getTag(tagId);
          } catch {
            resolvedTag = null;
          }
        }

        if (cancelled) return;

        if (!resolvedTag) {
          setError('No public notes available for this tag.');
        } else {
          setTag(resolvedTag);
        }
        setLoading(false);

        if (!cancelled && tagId) {
          fetchCommentCounts({ tagId }).then((counts) => {
            if (!cancelled) setCommentCounts(counts);
          }).catch(() => { /* ignore comment count errors */ });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading tag notes:', err);
        setError('Failed to load notes');
        setLoading(false);
      }
    };

    loadTagAndNotes();

    return () => {
      cancelled = true;
    };
  }, [tagId, fetchNotes, getTags, isAuthenticated, sortOrder, getApiOrdering]);

  const handleEditNote = (note: Note) => {
    setNoteToEdit(note);
    setIsEditModalOpen(true);
  };

  const handleDeleteNote = async (
    evt: MouseEvent<HTMLButtonElement>, 
    note: Note
  ) => {
    evt.preventDefault();
    if (note.id) {
      if (window.confirm('Are you sure you want to delete this note?')) {
        await deleteNote(note.id);
        if (tagId) {
          await fetchNotes(tagId);
        }
      }
    }
  };

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(`/bible/${book}/${chapter}.${verse}`);
    setShowNotes(false);
  };

  const handleCountChange = (
    noteId: string,
    delta: number
  ) => {
    setCommentCounts((prev) => ({
      ...prev,
      [noteId]: (prev[noteId] ?? 0) + delta,
    }));
  };

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      navigate(`/notes/tag/${value}`);
    }
  };

  const handleRefresh = async () => {
    if (!tagId) return;
    
    try {
      // Clear cache for this tag
      clearNotesCache(tagId);
      
      // Refetch notes from API
      await fetchNotes(tagId);

      await getTags();
      
      showNotification({
        title: 'Refreshed!',
        message: 'Notes updated from server',
        color: 'green',
      });
    } catch (err) {
      console.error('Error refreshing notes:', err);
      showNotification({
        title: 'Error',
        message: 'Failed to refresh notes',
        color: 'red',
      });
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = `Notes: ${tag?.name || 'Tag'}`;
    const text = `Check out these ${notes.length} note(s) tagged with "${tag?.name}"`;

    // Try Web Share API first (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
        showNotification({
          title: 'Shared!',
          message: 'Link shared successfully',
          color: 'green',
        });
      } catch (err) {
        // User cancelled or error occurred
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        showNotification({
          title: 'Link Copied!',
          message: 'Tag link copied to clipboard',
          color: 'blue',
        });
      } catch (err) {
        console.error('Error copying to clipboard:', err);
        showNotification({
          title: 'Error',
          message: 'Failed to copy link',
          color: 'red',
        });
      }
    }
  };

  const handleSortChange = async (newSortOrder: string) => {
    if (!tagId) return;
    
    // Update URL
    setSearchParams({ sort: newSortOrder });
    
    // Check if we can sort client-side
    const canSortClientSide = notesCount <= 25 && notes.length > 0;
    
    if (canSortClientSide) {
      // Client-side sort - no API call needed
      console.log('📊 Sorting notes client-side');
      // Notes will be sorted by the existing sortedNotes logic
    } else {
      // Server-side sort - fetch from API
      console.log('📊 Fetching sorted notes from API');
      const apiOrdering = getApiOrdering(
        newSortOrder as SortOrder
      );
      await fetchNotes(tagId, { ordering: apiOrdering, page: 1 });
    }
  };

  const handleLoadMore = async () => {
    if (!tagId || !notesHasMore) return;
    
    const apiOrdering =
      sortOrder !== 'created_desc'
        ? getApiOrdering(sortOrder)
        : undefined;
    
    await fetchNotes(tagId, {
      ordering: apiOrdering,
      page: notesPage + 1,
      append: true,
    });
  };

  const sortedNotes = [...notes].sort((a, b) => {
    switch (sortOrder) {
      case 'custom_asc': {
        const aPos = a.tag_position ?? 0;
        const bPos = b.tag_position ?? 0;
        if (aPos !== bPos) return aPos - bPos;
        return (
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
        );
      }
      case 'custom_desc': {
        const aPos = a.tag_position ?? 0;
        const bPos = b.tag_position ?? 0;
        if (aPos !== bPos) return bPos - aPos;
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      }
      case 'created_desc':
        return (
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
        );
      case 'created_asc':
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      case 'verse_asc': {
        const aV = a.verses?.[0];
        const bV = b.verses?.[0];
        if (!aV) return 1;
        if (!bV) return -1;
        const aBook =
          BOOK_NAME_TO_ORDER[aV.book.toLowerCase()] ?? 999;
        const bBook =
          BOOK_NAME_TO_ORDER[bV.book.toLowerCase()] ?? 999;
        if (aBook !== bBook) return aBook - bBook;
        if (aV.chapter !== bV.chapter)
          return aV.chapter - bV.chapter;
        return aV.verse - bV.verse;
      }
      case 'verse_desc': {
        const aV = a.verses?.[0];
        const bV = b.verses?.[0];
        if (!aV) return 1;
        if (!bV) return -1;
        const aBook =
          BOOK_NAME_TO_ORDER[aV.book.toLowerCase()] ?? 999;
        const bBook =
          BOOK_NAME_TO_ORDER[bV.book.toLowerCase()] ?? 999;
        if (aBook !== bBook) return bBook - aBook;
        if (aV.chapter !== bV.chapter)
          return bV.chapter - aV.chapter;
        return bV.verse - aV.verse;
      }
      default:
        return 0;
    }
  });

  const handlePlayFromNote = useCallback(
    (noteId: string) => {
      const noteIndex = sortedNotes.findIndex((n) => n.id === noteId);
      
      if (noteIndex >= 0) {
        setAudioPlaylistStartIndex(noteIndex);
        
        showNotification({
          title: 'Playlist Started',
          message: `Playing from note ${noteIndex + 1} of ${sortedNotes.length}`,
          color: 'blue',
          autoClose: 3000,
        });
      }
    },
    [sortedNotes, setAudioPlaylistStartIndex]
  );

  useEffect(() => {
    if (loading || notes.length === 0) {
      setAudioPlaylistItems(null);
      return;
    }
    const items: PlaylistItem[] = sortedNotes
      .filter((n) => (n.verses?.length ?? 0) > 0)
      .map((note, i, arr) => {
        const firstVerse = note.verses![0];
        const sameBlock = note.verses!.filter(
          (v) =>
            v.book === firstVerse.book &&
            v.chapter === firstVerse.chapter,
        );
        const verseNumbers = sameBlock.map((v) => v.verse);
        const startVerse = Math.min(...verseNumbers);
        const endVerse = Math.max(...verseNumbers);
        const label =
          `Note ${i + 1}/${arr.length} ` +
          `\u2013 ${firstVerse.book} ` +
          `${firstVerse.chapter}:${startVerse}` +
          (startVerse !== endVerse ? `-${endVerse}` : '');
        return {
          itemId: note.id,
          book: firstVerse.book,
          chapter: firstVerse.chapter,
          startVerse,
          endVerse,
          label,
          verseNumbers,
        };
      });
    setAudioPlaylistItems(items.length > 0 ? items : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, sortOrder, loading, setAudioPlaylistItems]);

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="loading" />
      </Center>
    );
  }

  if (error || !tag) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="red" size="lg">
          {error || 'Tag not found'}
        </Text>
      </Center>
    );
  }

  const sortedTags = [...storedTags].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  return (
    <Box p="md">
      <Group mb="md" position="apart">
        {isAuthenticated && sortedTags.length > 0 ? (
          <Select
            label="Filter by tag"
            placeholder="Select a tag"
            value={tagId}
            onChange={handleTagChange}
            data={sortedTags.map(t => ({ value: t.id, label: t.name }))}
            searchable
            style={{ flex: 1, minWidth: 200, maxWidth: 400 }}
          />
        ) : (
          <Text fw={500} size="lg">{tag.name}</Text>
        )}
        <Group spacing="xs">
          <Select
            size="xs"
            value={sortOrder}
            onChange={(v) => {
              if (v) {
                handleSortChange(v);
              }
            }}
            data={[
              {
                value: 'custom_asc',
                label: 'Custom: Ascending',
              },
              {
                value: 'custom_desc',
                label: 'Custom: Descending',
              },
              {
                value: 'created_desc',
                label: 'Date: Newest first',
              },
              {
                value: 'created_asc',
                label: 'Date: Oldest first',
              },
              {
                value: 'verse_asc',
                label: 'Verse: Ascending',
              },
              {
                value: 'verse_desc',
                label: 'Verse: Descending',
              },
            ]}
            style={{ width: 170 }}
          />
          <Text color="dimmed" size="sm">
            {notes.length}
            {notesCount > notes.length && ` of ${notesCount}`}
            {' '}
            {notes.length === 1 ? 'note' : 'notes'}
          </Text>
          <Tooltip
            label={versesFolded ? "Unfold verses" : "Fold verses"}
            position="left"
          >
            <ActionIcon
              onClick={() => setVersesFolded(!versesFolded)}
              variant="subtle"
              color={versesFolded ? "blue" : "gray"}
              size="lg"
            >
              {versesFolded
                ? <IconArrowsMaximize size={20} />
                : <IconArrowsMinimize size={20} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh notes" position="left">
            <ActionIcon
              onClick={handleRefresh}
              variant="subtle"
              color="gray"
              size="lg"
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Share tag link" position="left">
            <ActionIcon
              onClick={handleShare}
              variant="subtle"
              color="blue"
              size="lg"
            >
              <IconShare size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea style={{ height: 'calc(100vh - 200px)' }}>
        {notes.length > 0 ? (
          <Stack spacing="md">
            {notesCount > 25 &&
              (sortOrder === 'custom_asc' ||
                sortOrder === 'custom_desc') && (
              <Alert icon={<IconInfoCircle />} color="blue">
                Custom ordering is only available for tags with 25
                or fewer notes. This tag has {notesCount} notes.
                Use date or verse ordering instead.
              </Alert>
            )}
            
            <TagSection
              tagName={tag.name}
              notes={sortedNotes}
              onViewInBible={handleViewInBible}
              onEditNote={
                isAuthenticated ? handleEditNote : undefined
              }
              onDeleteNote={
                isAuthenticated
                  ? handleDeleteNote
                  : undefined
              }
              onPlayFromNote={handlePlayFromNote}
              commentCounts={commentCounts}
              onCountChange={handleCountChange}
              isDraggable={
                (sortOrder === 'custom_asc' ||
                  sortOrder === 'custom_desc') &&
                isAuthenticated &&
                notesCount <= 25
              }
              tagId={tagId || ''}
              onReorder={reorderNotes}
              sortOrder={sortOrder}
            />
            
            {notesHasMore && (
              <Center mt="md">
                <Button onClick={handleLoadMore} variant="outline">
                  Load More ({notesCount - notes.length} remaining)
                </Button>
              </Center>
            )}
          </Stack>
        ) : (
          <Center style={{ height: 200 }}>
            <Text>No notes found for this tag.</Text>
          </Center>
        )}
      </ScrollArea>

      <EditNoteModal
        opened={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        note={noteToEdit}
      />
    </Box>
  );
}
