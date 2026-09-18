"use client";

import { useEffect, useRef } from "react";

interface IUseVisitorNotifications {
  id: string | null;
  onNewNotification: (data: any) => void;
}

export default function useVisitorNotifications({
  id,
  onNewNotification,
}: IUseVisitorNotifications) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let userId = id;
    
    if (!userId) {
      userId = `fallback-${new Date().toISOString()}-${Math.random().toString(36).slice(2)}`;
    };

    // Load notification sound
    audioRef.current = new Audio("/sounds/notification.mp3");

    const sseURL = `${process.env.NEXT_PUBLIC_API_URL}/service/notifications/stream?userId=${encodeURIComponent(
      userId
    )}`;

    const sse = new EventSource(sseURL);

    sse.addEventListener("visitor_notification", (event: any) => {
      const payload = JSON.parse(event.data);

      // Unified callback
      onNewNotification(payload);

      // Play sound
      audioRef.current?.play().catch(() => {
        console.warn("Audio playback was blocked.");
      });
    });

    sse.onerror = (e) => {
      console.warn("SSE error. Browser will reconnect automatically.", e);
    };

    return () => sse.close();
  }, [id]);
}
