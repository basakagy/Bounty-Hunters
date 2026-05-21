import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useDiffComments } from "~/hooks/useDiffComments";
import { DiffCommentsOverlay } from "./DiffComments";

interface DiffCommentsIntegrationProps {
  containerRef: RefObject<HTMLDivElement | null>;
  filePath: string;
  /** Unique key that changes when the diff content changes */
  contentKey: string;
}

/**
 * Integrates inline commenting with diff rendering.
 * Uses DOM mutation observation to find line numbers and attach click handlers.
 */
export function DiffCommentsIntegration({
  containerRef,
  filePath,
  contentKey,
}: DiffCommentsIntegrationProps) {
  const {
    activeInput,
    openInput,
    closeInput,
    addComment,
    removeComment,
    getCommentsForLine,
    getCommentCount,
    clearComments,
  } = useDiffComments();

  const [activeLine, setActiveLine] = useState<number | null>(null);

  // Clear comments when content changes
  useEffect(() => {
    clearComments();
    setActiveLine(null);
  }, [contentKey, clearComments]);

  // Attach click handlers to line numbers after render
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent) => {
      // Detect if the click target is a line number element
      const target = e.target as HTMLElement;
      // The diff library renders line numbers with specific attributes
      const lineNumEl = target.closest("[data-line-number], [data-diff-line-number]") as HTMLElement | null;
      if (!lineNumEl) return;

      const lineNumberText = lineNumEl.textContent?.trim();
      if (!lineNumberText) return;
      const lineNumber = parseInt(lineNumberText, 10);
      if (isNaN(lineNumber)) return;

      setActiveLine(lineNumber);
      openInput(filePath, lineNumber);
    };

    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [containerRef, filePath, openInput]);

  const handleCloseInput = useCallback(() => {
    setActiveLine(null);
    closeInput();
  }, [closeInput]);

  const handleAddComment = useCallback(
    (fp: string, line: number, text: string) => {
      addComment(fp, line, text);
      setActiveLine(null);
    },
    [addComment],
  );

  // If there's an active line, render the comment input overlay
  return activeLine ? (
    <DiffCommentsOverlay
      filePath={filePath}
      lineNumber={activeLine}
      comments={getCommentsForLine(filePath, activeLine)}
      isInputActive={true}
      onOpenInput={openInput}
      onAddComment={handleAddComment}
      onRemoveComment={removeComment}
      onCloseInput={handleCloseInput}
    />
  ) : null;
}

/**
 * Comment count badge component for the diff panel tab header.
 */
export function CommentCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-medium text-primary">
      {count > 99 ? "99+" : count}
    </span>
  );
}
