/**
 * useInactivityTimeout — Auto sign-out after N minutes of inactivity
 *
 * Tracks mouse movement, key presses, clicks, scrolls, and touch events.
 * When no activity is detected for the specified duration, shows a warning
 * toast 60 seconds before sign-out, then signs the user out automatically.
 *
 * Also tracks last_seen_at on the server every 60 seconds while active.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_MS = 60 * 1000; // Show warning 60 seconds before logout
const LAST_SEEN_INTERVAL_MS = 60 * 1000; // Update last_seen_at every 60s

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningShownRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (lastSeenTimerRef.current) clearInterval(lastSeenTimerRef.current);
  }, []);

  const updateLastSeen = useCallback(async () => {
    if (!user) return;
    // Best-effort update — don't block or throw
    try {
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } catch {
      // Silently ignore
    }
  }, [user]);

  const handleSignOut = useCallback(async () => {
    if (!user) return;
    // LOW-4 fix : utiliser le RPC record_user_logout() qui utilise NOW() côté serveur,
    // au lieu d'un UPDATE direct sur profiles avec un timestamp client-supplied.
    // Empêche un attaquant avec token volé de forger des last_logout_at arbitraires.
    try {
      await supabase.rpc("record_user_logout");
    } catch {
      // Silently ignore — best effort
    }

    toast({
      title: "Session expirée",
      description: "Vous avez été déconnecté pour inactivité.",
      variant: "destructive",
    });

    await signOut();
  }, [user, signOut, toast]);

  const showWarning = useCallback(() => {
    if (warningShownRef.current) return;
    warningShownRef.current = true;

    toast({
      title: "Inactivité détectée",
      description: "Vous serez déconnecté dans 1 minute si aucune activité n'est détectée.",
      duration: WARNING_MS,
    });
  }, [toast]);

  const resetTimer = useCallback(() => {
    warningShownRef.current = false;

    // Clear existing timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Set warning timer (4 minutes = 5 min - 1 min warning)
    warningTimerRef.current = setTimeout(showWarning, INACTIVITY_MS - WARNING_MS);

    // Set sign-out timer (5 minutes)
    timerRef.current = setTimeout(handleSignOut, INACTIVITY_MS);
  }, [handleSignOut, showWarning]);

  useEffect(() => {
    if (!user) {
      clearTimers();
      return;
    }

    // Start the initial timer
    resetTimer();

    // Add activity listeners
    const onActivity = () => resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    // Start periodic last_seen_at update
    updateLastSeen();
    lastSeenTimerRef.current = setInterval(updateLastSeen, LAST_SEEN_INTERVAL_MS);

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [user, resetTimer, clearTimers, updateLastSeen]);
}
