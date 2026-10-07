"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadFromInbox, ownerUid } from "@/lib/browser/inbox-storage";
import type { browserSupabase } from "@/lib/browser/supabase";

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

const CONCURRENCY = 3;

type Store = {
  disposed: boolean;
  urls: Map<string, string>;
  failed: Set<string>;
  inflight: Set<string>;
  wanted: Set<string>;
  pending: string[];
  uid: Promise<string | null> | null;
};

/**
 * Thumbnails for queued images, shown on this device only. Each listed image is downloaded from the
 * Inbox bucket (as the drain does), turned into an object URL and cached by name for the page's life;
 * at most three downloads run at once. A URL is revoked when its file leaves the list and when the
 * page unmounts. A failed download or an undecodable image (`markBroken`) shows a placeholder.
 */
export function useInboxPreviews(supabase: Client | null, imageNames: readonly string[]) {
  const store = useRef<Store | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const publish = useCallback((s: Store) => {
    setUrls(Object.fromEntries(s.urls));
    setFailed(new Set(s.failed));
  }, []);

  useEffect(() => {
    const s: Store = {
      disposed: false, urls: new Map(), failed: new Set(), inflight: new Set(), wanted: new Set(), pending: [], uid: null
    };
    store.current = s;
    return () => {
      s.disposed = true;
      for (const url of s.urls.values()) URL.revokeObjectURL(url);
      s.urls.clear();
      store.current = null;
    };
  }, [supabase]);

  const key = imageNames.join("\n");
  useEffect(() => {
    const s = store.current;
    if (!s || !supabase) return;
    const names = key === "" ? [] : key.split("\n");
    s.wanted = new Set(names);
    let changed = false;
    for (const [name, url] of s.urls) {
      if (!s.wanted.has(name)) { URL.revokeObjectURL(url); s.urls.delete(name); changed = true; }
    }
    for (const name of [...s.failed]) if (!s.wanted.has(name)) { s.failed.delete(name); changed = true; }
    s.pending = names.filter((name) => !s.urls.has(name) && !s.failed.has(name) && !s.inflight.has(name));
    if (changed) publish(s);

    const pump = () => {
      while (!s.disposed && s.inflight.size < CONCURRENCY && s.pending.length > 0) {
        const name = s.pending.shift() as string;
        if (!s.wanted.has(name) || s.urls.has(name) || s.inflight.has(name)) continue;
        s.inflight.add(name);
        void (async () => {
          let blob: Blob | null = null;
          try {
            s.uid ??= ownerUid(supabase).then((uid) => (uid.ok ? uid.value : null));
            const uid = await s.uid;
            if (uid) {
              const downloaded = await downloadFromInbox(supabase, uid, name);
              if (downloaded.ok) blob = downloaded.value;
            }
          } catch {
            blob = null;
          }
          s.inflight.delete(name);
          if (!s.disposed) {
            if (blob && s.wanted.has(name)) s.urls.set(name, URL.createObjectURL(blob));
            else if (!blob) s.failed.add(name);
            publish(s);
          }
          pump();
        })();
      }
    };
    pump();
  }, [supabase, key, publish]);

  const markBroken = useCallback((name: string) => {
    const s = store.current;
    if (!s) return;
    const url = s.urls.get(name);
    if (url) URL.revokeObjectURL(url);
    s.urls.delete(name);
    s.failed.add(name);
    publish(s);
  }, [publish]);

  return { urls, failed, markBroken };
}
