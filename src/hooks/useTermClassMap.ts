import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTerm } from "@/context/TermContext";

export type TermClassEntry = { form: string | null; stream: string | null };
export type TermClassMap = Map<string, TermClassEntry>;

/**
 * Returns a map of profileId → {form, stream} for the currently selected term.
 * Callers should overlay this on top of profile rows so past terms preserve
 * their historical class assignments even if the profile has since changed.
 */
export function useTermClassMap() {
  const { selectedTermId } = useTerm();
  const [map, setMap] = useState<TermClassMap>(new Map());
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!selectedTermId) { setMap(new Map()); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("student_class_terms")
      .select("student_profile_id, form, stream")
      .eq("term_id", selectedTermId);
    setLoading(false);
    if (error) return;
    const m: TermClassMap = new Map();
    (data || []).forEach((r: any) => m.set(r.student_profile_id, { form: r.form, stream: r.stream }));
    setMap(m);
  }, [selectedTermId]);

  useEffect(() => { reload(); }, [reload]);

  /** Overlay term class onto rows that have {id, form?, stream?}. Falls back to profile values. */
  const overlay = useCallback(<T extends { id: string; form?: string | null; stream?: string | null }>(
    rows: T[]
  ): T[] => {
    if (map.size === 0) return rows;
    return rows.map(r => {
      const t = map.get(r.id);
      if (!t) return r;
      return { ...r, form: t.form ?? r.form, stream: t.stream ?? r.stream };
    });
  }, [map]);

  return { map, overlay, reload, loading, selectedTermId };
}

/** Upsert a student's class into the given term (or the current term if omitted). */
export async function upsertStudentClassForTerm(
  studentProfileId: string,
  form: string | null,
  stream: string | null,
  termId?: string | null
) {
  let tid = termId;
  if (!tid) {
    const { data } = await supabase.from("terms").select("id").eq("is_current", true).maybeSingle();
    tid = data?.id ?? null;
  }
  if (!tid) return { error: null };
  return await supabase
    .from("student_class_terms")
    .upsert({ term_id: tid, student_profile_id: studentProfileId, form, stream }, { onConflict: "term_id,student_profile_id" });
}

/** Bulk upsert for many students at once. */
export async function upsertStudentClassesForTerm(
  entries: { studentProfileId: string; form: string | null; stream: string | null }[],
  termId?: string | null
) {
  let tid = termId;
  if (!tid) {
    const { data } = await supabase.from("terms").select("id").eq("is_current", true).maybeSingle();
    tid = data?.id ?? null;
  }
  if (!tid || entries.length === 0) return { error: null };
  const rows = entries.map(e => ({ term_id: tid, student_profile_id: e.studentProfileId, form: e.form, stream: e.stream }));
  return await supabase
    .from("student_class_terms")
    .upsert(rows, { onConflict: "term_id,student_profile_id" });
}
