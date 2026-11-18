import { useEffect } from "react";

const TOAST_MS = 3000;

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
