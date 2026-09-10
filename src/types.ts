export interface Tag {
  id: string;
  name: string;
  parent_tag: string | null;
  created_at: string;
  updated_at: string;
}

export interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Note {
  id: string;
  note_text: string;
  public: boolean;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag;
  verses: Verse[];
  tag_position: number | null;
}

export interface SectionHeading {
  before_verse: number;
  text: string;
}

export interface VerseTimestamp {
  verse_start: number;
  timestamp: number;
}

export interface FilesetCopyright {
  id: string;
  type: string;
  size: string;
  copyright: string;
  copyright_date: string;
  copyright_description: string;
}

export interface CommentAuthor {
  id: number;
  username: string;
}

export interface Comment {
  id: string;
  author: CommentAuthor;
  note_id: string;
  parent_comment: string | null;
  content: string;
  timestamp: string;
  is_deleted: boolean;
  replies: Comment[] | undefined;
}

export type CommentCounts = Record<string, number>;

export interface PlaylistItem {
  itemId: string;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  label: string;
  verseNumbers?: number[];
}

export interface AudioActiveVerse {
  book: string;
  chapter: number;
  verse: number;
}

export interface ReadingPosition {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  last_accessed: string;
}
