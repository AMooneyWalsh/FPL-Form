import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ShareCard, ShareNames } from "../../shared/share";
import type { LeagueData } from "./data";
import { shareImage } from "./share";

/** The names a share card needs, from the league data. */
export function shareNames(data: LeagueData): ShareNames {
  return {
    league: data.league.league.name,
    managers: data.labels,
    teams: new Map([...data.entries].map(([id, e]) => [id, e.entry_name])),
    players: new Map([...data.players].map(([id, p]) => [id, p.name])),
  };
}

/**
 * A small "Share" button that draws a picture (a match, a trade, a manager) and
 * opens a preview with Share and Save image. `card` only runs on tap, so the
 * picture is of the moment it was tapped and costs nothing until then. Never
 * put it inside a .fold-btn or a link. See docs/share-cards.md.
 */
export function ShareButton({ card, what }: { card: () => ShareCard; what: string }) {
  const [shown, setShown] = useState<ShareCard | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setShown(null);
    button.current?.focus();
  }, []);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="share-btn"
        onClick={() => setShown(card())}
        aria-haspopup="dialog"
        aria-label={`Share a picture of ${what}`}
      >
        <ShareIcon />
        Share
      </button>
      {/* Drawn on the page itself, so it covers the sticky tabs rather than sitting under them. */}
      {shown && createPortal(<ShareSheet card={shown} onClose={close} />, document.body)}
    </>
  );
}

type Picture = { status: "drawing" } | { status: "error" } | { status: "ready"; url: string; file: File; canShare: boolean };

/**
 * The preview: the picture, then Share (phones, where the browser can share
 * files) and Save image. Drawing happens first so that Share runs straight
 * from its own tap, which iPhones insist on.
 */
function ShareSheet({ card, onClose }: { card: ShareCard; onClose: () => void }) {
  const [picture, setPicture] = useState<Picture>({ status: "drawing" });
  const [problem, setProblem] = useState<string | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    shareImage(card).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const file = new File([blob], `${card.file}.png`, { type: "image/png" });
        setPicture({ status: "ready", url, file, canShare: canShareFiles(file) });
      },
      () => !cancelled && setPicture({ status: "error" }),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [card]);

  const share = async (file: File) => {
    setProblem(null);
    try {
      await navigator.share({ files: [file], text: card.caption });
    } catch (e) {
      // Closing the share sheet without picking anyone isn't a problem.
      if ((e as Error)?.name === "AbortError") return;
      setProblem("Sharing didn't work. Save the image instead, then share it from your photos.");
    }
  };

  return (
    // Clicks stay in here, so they never reach whatever card the button sits on.
    <div className="share-sheet" role="dialog" aria-modal="true" aria-label="Share a picture" onClick={(e) => e.stopPropagation()}>
      <div className="share-sheet-inner">
        <div className="share-sheet-bar">
          <strong>Share a picture</strong>
          <button ref={closeBtn} type="button" className="link share-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="share-preview">
          {picture.status === "drawing" && <p className="hint">Drawing the picture…</p>}
          {picture.status === "error" && <p className="notice error">Couldn't draw the picture on this browser.</p>}
          {picture.status === "ready" && <img src={picture.url} alt={card.caption} />}
        </div>
        {picture.status === "ready" && (
          <>
            <div className="share-actions">
              {picture.canShare && (
                <button type="button" className="share-action" onClick={() => share(picture.file)}>
                  <ShareIcon />
                  Share
                </button>
              )}
              <a className="share-action" href={picture.url} download={picture.file.name}>
                Save image
              </a>
            </div>
            {problem && <p className="notice error">{problem}</p>}
            <p className="hint">You can also press and hold the picture to copy or save it.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Phones (and some computers) can hand a picture to other apps; most desktop browsers can't. */
function canShareFiles(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** A box with an arrow out of the top: the usual "share" sign. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="share-icon">
      <path
        d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
