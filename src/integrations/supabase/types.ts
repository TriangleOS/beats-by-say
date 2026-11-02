// Hand-written types for the Beats by Say tables on the shared Triangle OS project.
// Keep in step with supabase/migrations.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type BeatRow = {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  bpm: number;
  music_key: string;
  mood: string;
  description: string;
  spec: Json;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      beatsbysay_beats: {
        Row: BeatRow;
        Insert: Omit<BeatRow, "id" | "created_at" | "prompt" | "bpm" | "music_key" | "mood" | "description"> &
          Partial<Pick<BeatRow, "id" | "created_at" | "prompt" | "bpm" | "music_key" | "mood" | "description">>;
        Update: Partial<BeatRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
