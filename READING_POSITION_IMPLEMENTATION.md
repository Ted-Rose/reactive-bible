# Reading Position Tracking - Implementation Plan

## Overview

Implement per-book chapter and verse tracking that persists across devices by storing reading positions at the database level. When users navigate to a book via BibleSelector or other navigation components, the app will automatically restore their last reading position for that book.

## Current State

### Frontend (React + Zustand)
- **Store**: `activeBook`, `activeBookShort`, `activeChapter`, `activeVerses` stored in localStorage
- **Navigation**: BibleSelector always navigates to chapter 1 when switching books (line 93)
- **Limitation**: localStorage is device-specific, doesn't sync across devices

### Backend (Django REST Framework)
- **Database**: PostgreSQL (production), SQLite (development)
- **Authentication**: Token-based (DRF TokenAuthentication)
- **Existing Models**: User, Tag, Note, Verse, NoteVerse
- **API Base**: `https://bible-research-489314.ey.r.appspot.com/api/v1/`

## Solution Design

### 1. Database Schema (Backend)

#### New Model: `ReadingPosition`

```python
# annotations/models.py

class ReadingPosition(models.Model):
    """
    Tracks the last reading position for each book per user.
    Automatically syncs across all devices.
    """
    id = models.CharField(
        max_length=18, 
        primary_key=True, 
        editable=False
    )  # RDP + 15 random chars
    
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='reading_positions'
    )
    
    book = models.CharField(
        max_length=50,
        help_text="Book name (e.g., 'Genesis', 'John', '1 Chronicles')"
    )
    
    chapter = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1)]
    )
    
    verse = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="First verse in view (for scroll position restoration)"
    )
    
    last_accessed = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'reading_positions'
        unique_together = [['user', 'book']]
        ordering = ['-last_accessed']
        indexes = [
            models.Index(fields=['user', 'book']),
            models.Index(fields=['user', '-last_accessed']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.book} {self.chapter}:{self.verse}"
    
    def save(self, *args, **kwargs):
        if not self.id:
            self.id = generate_id('RDP')
        super().save(*args, **kwargs)
```

**Key Features**:
- One position per user per book (enforced by `unique_together`)
- Auto-updates `last_accessed` timestamp on every save
- Indexed for fast lookups by user and book
- Stores both chapter and verse for precise scroll restoration

### 2. API Endpoints (Backend)

#### Base URL: `/api/v1/reading-positions/`

#### A. List Reading Positions
```
GET /api/v1/reading-positions/
Authorization: Token <your-token>
```

**Response**:
```json
[
  {
    "id": "RDP1A2B3C4D5E6F7G8",
    "book": "John",
    "chapter": 3,
    "verse": 16,
    "last_accessed": "2026-09-02T10:30:00Z"
  },
  {
    "id": "RDP9H8I7J6K5L4M3N2",
    "book": "Genesis",
    "chapter": 1,
    "verse": 1,
    "last_accessed": "2026-09-01T15:20:00Z"
  }
]
```

#### B. Get Position for Specific Book
```
GET /api/v1/reading-positions/?book=John
Authorization: Token <your-token>
```

**Response**:
```json
{
  "id": "RDP1A2B3C4D5E6F7G8",
  "book": "John",
  "chapter": 3,
  "verse": 16,
  "last_accessed": "2026-09-02T10:30:00Z"
}
```

#### C. Update/Create Reading Position
```
POST /api/v1/reading-positions/
Authorization: Token <your-token>
Content-Type: application/json

{
  "book": "John",
  "chapter": 3,
  "verse": 16
}
```

**Response** (201 Created or 200 OK):
```json
{
  "id": "RDP1A2B3C4D5E6F7G8",
  "book": "John",
  "chapter": 3,
  "verse": 16,
  "last_accessed": "2026-09-02T10:30:00Z"
}
```

**Behavior**: 
- If position exists for this user+book, update it
- If not, create new position
- Always updates `last_accessed` timestamp

#### D. Bulk Get Positions (Optimization)
```
POST /api/v1/reading-positions/bulk/
Authorization: Token <your-token>
Content-Type: application/json

{
  "books": ["John", "Genesis", "Matthew", "Romans"]
}
```

**Response**:
```json
{
  "John": {"chapter": 3, "verse": 16},
  "Genesis": {"chapter": 1, "verse": 1},
  "Matthew": {"chapter": 5, "verse": 1},
  "Romans": null  // No position saved yet
}
```

### 3. Backend Implementation Files

#### A. Serializer (`annotations/serializers.py`)

```python
class ReadingPositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingPosition
        fields = ['id', 'book', 'chapter', 'verse', 'last_accessed']
        read_only_fields = ['id', 'last_accessed']
    
    def validate_book(self, value):
        """Validate book name against known Bible books"""
        from bible.utils.book_mappings import BOOK_NAMES
        if value not in BOOK_NAMES.values():
            raise serializers.ValidationError(f"Invalid book name: {value}")
        return value
    
    def create(self, validated_data):
        """Create or update reading position (upsert behavior)"""
        user = self.context['request'].user
        book = validated_data['book']
        
        position, created = ReadingPosition.objects.update_or_create(
            user=user,
            book=book,
            defaults={
                'chapter': validated_data['chapter'],
                'verse': validated_data.get('verse', 1)
            }
        )
        return position
```

#### B. ViewSet (`annotations/views.py`)

```python
class ReadingPositionViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingPositionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter positions to current user only"""
        user = self.request.user
        queryset = ReadingPosition.objects.filter(user=user)
        
        # Optional book filter
        book = self.request.query_params.get('book')
        if book:
            queryset = queryset.filter(book=book)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """Upsert: create or update reading position"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        position = serializer.save()
        
        return Response(
            self.get_serializer(position).data,
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Bulk fetch positions for multiple books"""
        books = request.data.get('books', [])
        if not isinstance(books, list):
            return Response(
                {'error': 'books must be an array'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        positions = ReadingPosition.objects.filter(
            user=request.user,
            book__in=books
        )
        
        result = {book: None for book in books}
        for pos in positions:
            result[pos.book] = {
                'chapter': pos.chapter,
                'verse': pos.verse
            }
        
        return Response(result)
```

#### C. URL Configuration (`bible_research/urls.py`)

```python
from annotations.views import ReadingPositionViewSet

router.register(r'reading-positions', ReadingPositionViewSet, basename='reading-position')
```

### 4. Frontend Implementation

#### A. API Client (`src/api.tsx`)

```typescript
export interface ReadingPosition {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  last_accessed: string;
}

/**
 * Get reading position for a specific book
 */
export const getReadingPosition = async (
  book: string
): Promise<ReadingPosition | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/reading-positions/?book=${encodeURIComponent(book)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch reading position');
    }
    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error fetching reading position:', error);
    return null; // Graceful degradation
  }
};

/**
 * Update reading position for current book/chapter/verse
 */
export const updateReadingPosition = async (
  book: string,
  chapter: number,
  verse: number = 1
): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/reading-positions/`,
      {
        method: 'POST',
        body: JSON.stringify({ book, chapter, verse }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update reading position');
    }
  } catch (error) {
    console.error('Error updating reading position:', error);
    // Silent fail - don't block user experience
  }
};

/**
 * Bulk fetch reading positions for multiple books
 */
export const getBulkReadingPositions = async (
  books: string[]
): Promise<Record<string, { chapter: number; verse: number } | null>> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/reading-positions/bulk/`,
      {
        method: 'POST',
        body: JSON.stringify({ books }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to fetch bulk reading positions');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching bulk reading positions:', error);
    return {};
  }
};
```

#### B. Zustand Store Updates (`src/store.tsx`)

```typescript
interface BibleState {
  // ... existing fields ...
  readingPositions: Record<string, { chapter: number; verse: number }>;
  
  // ... existing methods ...
  
  /**
   * Set active book and restore last reading position
   */
  setActiveBookWithPosition: (activeBook: string) => Promise<void>;
  
  /**
   * Update reading position in store and sync to backend
   */
  syncReadingPosition: (book: string, chapter: number, verse?: number) => Promise<void>;
  
  /**
   * Prefetch reading positions for all books
   */
  prefetchReadingPositions: () => Promise<void>;
}

export const useBibleStore = createWithEqualityFn<BibleState>()(
  persist(
    (set, get) => ({
      // ... existing state ...
      readingPositions: {},
      
      setActiveBookWithPosition: async (activeBook: string) => {
        const { readingPositions } = get();
        
        // Check cache first
        let position = readingPositions[activeBook];
        
        // If not cached, fetch from API
        if (!position) {
          const apiPosition = await api.getReadingPosition(activeBook);
          if (apiPosition) {
            position = {
              chapter: apiPosition.chapter,
              verse: apiPosition.verse
            };
            set(state => ({
              readingPositions: {
                ...state.readingPositions,
                [activeBook]: position!
              }
            }));
          }
        }
        
        // Set active book with restored position or default to chapter 1
        set({
          activeBook,
          activeChapter: position?.chapter || 1,
          activeVerses: position?.verse ? [position.verse] : [],
          audioActiveVerse: null
        });
      },
      
      syncReadingPosition: async (book: string, chapter: number, verse: number = 1) => {
        // Update local cache
        set(state => ({
          readingPositions: {
            ...state.readingPositions,
            [book]: { chapter, verse }
          }
        }));
        
        // Sync to backend (fire and forget)
        api.updateReadingPosition(book, chapter, verse);
      },
      
      prefetchReadingPositions: async () => {
        const books = api.getBooks().map(b => b.book_name);
        const positions = await api.getBulkReadingPositions(books);
        
        set({ readingPositions: positions as any });
      },
      
      // ... existing methods ...
    }),
    {
      name: "bible-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // ... existing fields ...
        readingPositions: state.readingPositions, // Cache positions locally
      }),
    }
  )
);
```

#### C. BibleSelector Component Updates (`src/components/BibleSelector.tsx`)

```typescript
const BibleSelector = ({ opened, setOpened }: { ... }) => {
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveBookShort = useBibleStore((state) => state.setActiveBookShort);
  const setActiveBookWithPosition = useBibleStore((state) => state.setActiveBookWithPosition);

  return (
    <Navbar ...>
      <Navbar.Section grow sx={{ overflow: "hidden" }}>
        <Box ...>
          <Box style={{ flex: "0 0 185px", overflow: "hidden" }}>
            <ScrollArea h="100%" className={classes.border}>
              {getBooks().map((book) => (
                <a
                  className={cx(classes.link, {
                    [classes.linkActive]: activeBook === book.book_name,
                  })}
                  href="/"
                  onClick={async (event) => {
                    event.preventDefault();
                    setActiveBookShort(book.book_id);
                    
                    // Restore last reading position for this book
                    await setActiveBookWithPosition(book.book_name);
                    
                    // Navigate to restored position
                    const state = useBibleStore.getState();
                    navigate(`/bible/${book.book_name}/${state.activeChapter}`);
                  }}
                  key={book.book_id}
                  title={"nav-book-" + book.book_id}
                >
                  {book.book_name}
                </a>
              ))}
            </ScrollArea>
          </Box>
          {/* ... rest of component ... */}
        </Box>
      </Navbar.Section>
    </Navbar>
  );
};
```

#### D. PassageView Component Updates (`src/components/PassageView.tsx`)

Add position tracking when user views a chapter:

```typescript
useEffect(() => {
  // ... existing verse fetching logic ...
  
  // Sync reading position when chapter changes
  if (activeBook && activeChapter) {
    const firstVerse = activeVerses[0] || 1;
    syncReadingPosition(activeBook, activeChapter, firstVerse);
  }
}, [activeBook, activeChapter, activeVerses]);
```

#### E. App Component Updates (`src/components/App.tsx`)

Prefetch reading positions on app mount:

```typescript
useEffect(() => {
  const prefetchReadingPositions = useBibleStore.getState().prefetchReadingPositions;
  
  // Prefetch positions after user authentication
  const authStore = useAuthStore.getState();
  if (authStore.isAuthenticated) {
    prefetchReadingPositions();
  }
}, []);
```

### 5. Migration Strategy

#### Phase 1: Backend Setup
1. Create `ReadingPosition` model in `annotations/models.py`
2. Create and run Django migration
3. Implement serializer and viewset
4. Add URL routes
5. Test API endpoints manually

#### Phase 2: Frontend Integration
1. Add API client functions to `api.tsx`
2. Update Zustand store with new state and methods
3. Update BibleSelector to use `setActiveBookWithPosition`
4. Add position syncing to PassageView
5. Add prefetch logic to App component

#### Phase 3: Testing
1. Test position saving when navigating chapters
2. Test position restoration when switching books
3. Test cross-device sync (login on different browser)
4. Test graceful degradation (API failures)
5. Test with unauthenticated users (should use localStorage fallback)

#### Phase 4: Deployment
1. Deploy backend changes (migration + API)
2. Deploy frontend changes
3. Monitor for errors
4. Gather user feedback

### 6. Edge Cases & Considerations

#### A. Unauthenticated Users
- Fall back to localStorage-only behavior
- No API calls for reading positions
- Positions don't sync across devices

#### B. API Failures
- Silent failures - don't block user experience
- Use cached positions from localStorage
- Log errors for debugging

#### C. Performance
- Bulk fetch positions on app load (single API call)
- Cache positions in Zustand + localStorage
- Debounce position updates (don't spam API on every scroll)

#### D. Data Privacy
- Reading positions are private (user-specific)
- No public access to reading positions
- Respect user's privacy settings

#### E. Book Name Consistency
- Validate book names against `getBooks()` list
- Handle edge cases like "1 Chronicles" vs "1Chronicles"
- Use consistent book names across frontend/backend

### 7. Optional Enhancements (Future)

1. **Reading History**: Track all positions over time (not just last)
2. **Reading Stats**: Show reading progress, chapters completed
3. **Reading Goals**: Set daily/weekly reading goals
4. **Bookmarks**: Allow multiple saved positions per book
5. **Reading Plans**: Guided reading plans with progress tracking
6. **Export Data**: Allow users to export their reading history

## Implementation Checklist

### Backend
- [ ] Create `ReadingPosition` model
- [ ] Create Django migration
- [ ] Run migration on dev database
- [ ] Create `ReadingPositionSerializer`
- [ ] Create `ReadingPositionViewSet`
- [ ] Add URL routes
- [ ] Test API endpoints (Postman/curl)
- [ ] Write unit tests
- [ ] Update API documentation

### Frontend
- [ ] Add `ReadingPosition` interface to `types.ts`
- [ ] Add API functions to `api.tsx`
- [ ] Update Zustand store interface
- [ ] Implement `setActiveBookWithPosition`
- [ ] Implement `syncReadingPosition`
- [ ] Implement `prefetchReadingPositions`
- [ ] Update BibleSelector component
- [ ] Update PassageView component
- [ ] Update App component
- [ ] Test locally
- [ ] Write component tests
- [ ] Update CLAUDE.md documentation

### Deployment
- [ ] Deploy backend (run migrations)
- [ ] Deploy frontend
- [ ] Test on staging
- [ ] Monitor production logs
- [ ] Gather user feedback

## Timeline Estimate

- **Backend Development**: 2-3 hours
- **Frontend Development**: 3-4 hours
- **Testing**: 2 hours
- **Documentation**: 1 hour
- **Total**: ~8-10 hours

## Success Metrics

1. Users can switch between books and return to last reading position
2. Reading positions sync across devices within 5 seconds
3. No performance degradation (position updates are async)
4. 99%+ API success rate for position updates
5. Zero data loss (positions always saved)
