import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Term {
  id: string;
  term_number: number;
  year: number;
  is_current: boolean;
  started_at: string;
  ended_at: string | null;
}

interface TermContextValue {
  terms: Term[];
  currentTerm: Term | null;
  selectedTermId: string | null;
  setSelectedTermId: (id: string) => void;
  reload: () => Promise<void>;
  startNewTerm: (term_number: number, year: number) => Promise<Term | null>;
}

const TermContext = createContext<TermContextValue | undefined>(undefined);

const LS_KEY = "pcc.selectedTermId";

export const TermProvider = ({ children }: { children: ReactNode }) => {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermIdState] = useState<string | null>(
    () => localStorage.getItem(LS_KEY)
  );

  const setSelectedTermId = (id: string) => {
    setSelectedTermIdState(id);
    localStorage.setItem(LS_KEY, id);
  };

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("terms")
      .select("*")
      .order("year", { ascending: false })
      .order("term_number", { ascending: false });
    const list = (data || []) as Term[];
    setTerms(list);
    const current = list.find(t => t.is_current) || list[0] || null;
    if (!selectedTermId && current) {
      setSelectedTermId(current.id);
    } else if (selectedTermId && !list.find(t => t.id === selectedTermId) && current) {
      setSelectedTermId(current.id);
    }
  }, [selectedTermId]);

  useEffect(() => { reload(); }, []);

  const startNewTerm = async (term_number: number, year: number) => {
    // Capture the term we're rolling over from so we can copy its class rosters.
    const { data: prevTerm } = await supabase
      .from("terms").select("id").eq("is_current", true).maybeSingle();

    await supabase.from("terms").update({ is_current: false, ended_at: new Date().toISOString() }).eq("is_current", true);
    const { data, error } = await supabase
      .from("terms")
      .insert({ term_number, year, is_current: true })
      .select()
      .single();
    if (error) throw error;

    // Seed the new term's class rosters. Prefer copying from the previous term,
    // fall back to whatever is currently on each profile.
    if (data) {
      try {
        let seeded = false;
        if (prevTerm?.id) {
          const { data: prevRows } = await supabase
            .from("student_class_terms")
            .select("student_profile_id, form, stream")
            .eq("term_id", prevTerm.id);
          if (prevRows && prevRows.length > 0) {
            const rows = prevRows.map(r => ({ term_id: data.id, student_profile_id: r.student_profile_id, form: r.form, stream: r.stream }));
            await supabase.from("student_class_terms").upsert(rows, { onConflict: "term_id,student_profile_id" });
            seeded = true;
          }
        }
        if (!seeded) {
          const { data: profs } = await supabase
            .from("profiles").select("id, form, stream")
            .not("form", "is", null).not("stream", "is", null);
          if (profs && profs.length > 0) {
            const rows = profs.map((p: any) => ({ term_id: data.id, student_profile_id: p.id, form: p.form, stream: p.stream }));
            await supabase.from("student_class_terms").upsert(rows, { onConflict: "term_id,student_profile_id" });
          }
        }
      } catch { /* non-fatal: readers fall back to profile.form/stream */ }
    }

    await reload();
    if (data) setSelectedTermId(data.id);
    return data as Term;
  };

  const currentTerm = terms.find(t => t.is_current) || null;

  return (
    <TermContext.Provider value={{ terms, currentTerm, selectedTermId, setSelectedTermId, reload, startNewTerm }}>
      {children}
    </TermContext.Provider>
  );
};

export const useTerm = () => {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error("useTerm must be used within TermProvider");
  return ctx;
};

export const termLabel = (t: Term | null | undefined) =>
  t ? `Term ${t.term_number} ${t.year}` : "—";
