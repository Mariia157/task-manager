"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCommentAction } from "@/app/actions/tasks";
import { IconSend } from "@/components/icons";
import { AutoTextarea } from "@/components/ui/AutoTextarea";

export function CommentForm({ taskId, placeholder, send }: { taskId: string; placeholder: string; send: string }) {
  const [state, action, pending] = useActionState(addCommentAction.bind(null, taskId), {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
      <AutoTextarea
        name="text"
        required
        minRows={2}
        maxRows={10}
        maxLength={5000}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <button className="btn btn-primary" disabled={pending}>
        <IconSend size={16} />
        {send}
      </button>
    </form>
  );
}
