import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { useDiffComments, type DiffComment } from "~/hooks/useDiffComments";

interface DiffLineCommentProps {
  filePath: string;
  lineNumber: number;
  comments: DiffComment[];
  onAddComment: (filePath: string, lineNumber: number, text: string) => void;
  onRemoveComment: (id: string) => void;
  isInputActive: boolean;
  onOpenInput: (filePath: string, lineNumber: number) => void;
}

export function DiffLineCommentInput({
  filePath,
  lineNumber,
  onAddComment,
  onClose,
}: DiffLineCommentProps & { onClose: () => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onAddComment(filePath, lineNumber, text);
        setText("");
      }
    },
    [filePath, lineNumber, onAddComment, onClose, text],
  );

  return (
    <div className="border-t border-border/50 bg-card/50 p-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Leave a comment... (Cmd+Enter to submit)"
        className="min-h-[60px] w-full resize-none rounded-md border border-border/60 bg-background p-2 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        autoFocus
      />
      <div className="mt-1 flex justify-end gap-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onAddComment(filePath, lineNumber, text);
            setText("");
          }}
          disabled={!text.trim()}
          className="rounded bg-primary/80 px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary disabled:opacity-50"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

export function DiffCommentBubble({
  comment,
  onRemove,
}: {
  comment: DiffComment;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="group relative rounded-md border border-border/40 bg-card/80 p-2 text-xs">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {new Date(comment.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button
          type="button"
          onClick={() => onRemove(comment.id)}
          className="invisible rounded px-1 text-[10px] text-destructive/60 hover:text-destructive group-hover:visible"
          aria-label="Delete comment"
        >
          ✕
        </button>
      </div>
      <div className="whitespace-pre-wrap break-words text-foreground/90">
        {comment.text}
      </div>
    </div>
  );
}

interface DiffCommentsOverlayProps {
  filePath: string;
  lineNumber: number;
  comments: DiffComment[];
  isInputActive: boolean;
  onOpenInput: (filePath: string, lineNumber: number) => void;
  onAddComment: (filePath: string, lineNumber: number, text: string) => void;
  onRemoveComment: (id: string) => void;
  onCloseInput: () => void;
}

export function DiffCommentsOverlay({
  filePath,
  lineNumber,
  comments,
  isInputActive,
  onOpenInput,
  onAddComment,
  onRemoveComment,
  onCloseInput,
}: DiffCommentsOverlayProps) {
  return (
    <div className="border-l-2 border-primary/30 bg-card/30 pl-2">
      {comments.length > 0 && (
        <div className="mb-1 space-y-1">
          {comments.map((comment) => (
            <DiffCommentBubble
              key={comment.id}
              comment={comment}
              onRemove={onRemoveComment}
            />
          ))}
        </div>
      )}
      {isInputActive ? (
        <DiffLineCommentInput
          filePath={filePath}
          lineNumber={lineNumber}
          comments={comments}
          isInputActive={isInputActive}
          onAddComment={onAddComment}
          onRemoveComment={onRemoveComment}
          onOpenInput={onOpenInput}
          onClose={onCloseInput}
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpenInput(filePath, lineNumber)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
        >
          <span className="text-xs">+</span> Add comment
        </button>
      )}
    </div>
  );
}
