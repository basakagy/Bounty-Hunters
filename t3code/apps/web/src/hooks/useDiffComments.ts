import { useCallback, useRef, useState, useEffect } from "react";

export interface DiffComment {
  id: string;
  filePath: string;
  lineNumber: number;
  text: string;
  createdAt: string;
}

interface UseDiffCommentsReturn {
  comments: Map<string, DiffComment[]>;
  activeInput: { filePath: string; lineNumber: number } | null;
  openInput: (filePath: string, lineNumber: number) => void;
  closeInput: () => void;
  addComment: (filePath: string, lineNumber: number, text: string) => void;
  removeComment: (id: string) => void;
  getCommentsForLine: (filePath: string, lineNumber: number) => DiffComment[];
  getCommentCount: () => number;
  clearComments: () => void;
}

function generateId(): string {
  return `dc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useDiffComments(): UseDiffCommentsReturn {
  const [comments, setComments] = useState<Map<string, DiffComment[]>>(() => new Map());
  const [activeInput, setActiveInput] = useState<{ filePath: string; lineNumber: number } | null>(null);

  const addComment = useCallback((filePath: string, lineNumber: number, text: string) => {
    if (!text.trim()) return;
    const comment: DiffComment = {
      id: generateId(),
      filePath,
      lineNumber,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => {
      const next = new Map(prev);
      const key = `${filePath}:${lineNumber}`;
      const existing = next.get(key) ?? [];
      next.set(key, [...existing, comment]);
      return next;
    });
    setActiveInput(null);
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments((prev) => {
      const next = new Map(prev);
      for (const [key, list] of next) {
        const filtered = list.filter((c) => c.id !== id);
        if (filtered.length === 0) {
          next.delete(key);
        } else {
          next.set(key, filtered);
        }
      }
      return next;
    });
  }, []);

  const openInput = useCallback((filePath: string, lineNumber: number) => {
    setActiveInput({ filePath, lineNumber });
  }, []);

  const closeInput = useCallback(() => {
    setActiveInput(null);
  }, []);

  const clearComments = useCallback(() => {
    setComments(new Map());
    setActiveInput(null);
  }, []);

  const getCommentsForLine = useCallback(
    (filePath: string, lineNumber: number): DiffComment[] => {
      return comments.get(`${filePath}:${lineNumber}`) ?? [];
    },
    [comments],
  );

  const getCommentCount = useCallback((): number => {
    let count = 0;
    for (const list of comments.values()) {
      count += list.length;
    }
    return count;
  }, [comments]);

  // Keyboard shortcut: Escape closes active input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeInput) {
        closeInput();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeInput, closeInput]);

  return {
    comments,
    activeInput,
    openInput,
    closeInput,
    addComment,
    removeComment,
    getCommentsForLine,
    getCommentCount,
    clearComments,
  };
}
