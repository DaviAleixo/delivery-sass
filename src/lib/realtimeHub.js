import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { createRealtimeHub } from "@/lib/realtimeHubCore";

const defaultHub = createRealtimeHub({
  getClient: () => supabase,
  isConfigured: () => isSupabaseConfigured(),
});

export const {
  subscribeTableRealtime,
  isRealtimeChannelActive,
  getActiveRealtimeChannelCount,
} = defaultHub;
