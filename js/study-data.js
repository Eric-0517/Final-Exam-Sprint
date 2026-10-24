(() => {
  "use strict";

  const client = () => {
    if (!window.sb) throw new Error("Supabase 用戶端尚未初始化。");
    return window.sb;
  };

  async function currentUser() {
    const { data, error } = await client().auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  async function requireUser() {
    const user = await currentUser();
    if (!user) return null;
    return user;
  }

  async function saveAttempt(record) {
    const user = await requireUser();
    if (!user) return { saved: false, reason: "not_signed_in" };

    const payload = {
      user_id: user.id,
      subject: String(record.subject || "未分類"),
      quiz_name: String(record.quiz_name || record.subject || "測驗"),
      total_questions: Number(record.total_questions || 0),
      correct_count: Number(record.correct_count || 0),
      score: Number(record.score || 0),
      answers: record.answers || {},
      duration_seconds: Number.isFinite(Number(record.duration_seconds))
        ? Number(record.duration_seconds) : null
    };

    const { data, error } = await client()
      .from("quiz_attempts")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return { saved: true, data };
  }

  async function saveWrongQuestions(subject, questions, answers) {
    const user = await requireUser();
    if (!user) return { saved: false, reason: "not_signed_in" };

    const wrong = (questions || []).filter(q => answers[q.id] !== q.answer);
    for (const q of wrong) {
      const payload = {
        user_id: user.id,
        subject: String(subject || "未分類"),
        question_id: String(q.id),
        question_snapshot: q,
        last_answer: answers[q.id] || null,
        wrong_count: 1,
        is_mastered: false,
        updated_at: new Date().toISOString()
      };

      const { data: old, error: findError } = await client()
        .from("wrong_questions")
        .select("id,wrong_count,is_mastered")
        .eq("user_id", user.id)
        .eq("subject", payload.subject)
        .eq("question_id", payload.question_id)
        .maybeSingle();

      if (findError) throw findError;
      payload.wrong_count = old ? Number(old.wrong_count || 0) + 1 : 1;
      payload.is_mastered = old ? Boolean(old.is_mastered) : false;

      const { error } = await client()
        .from("wrong_questions")
        .upsert(payload, { onConflict: "user_id,subject,question_id" });
      if (error) throw error;
    }
    return { saved: true, count: wrong.length };
  }

  async function getAttempts(limit = 100) {
    const user = await requireUser();
    if (!user) return [];
    const { data, error } = await client()
      .from("quiz_attempts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function getWrongQuestions(includeMastered = true) {
    const user = await requireUser();
    if (!user) return [];
    let query = client().from("wrong_questions").select("*")
      .eq("user_id", user.id).order("updated_at", { ascending: false });
    if (!includeMastered) query = query.eq("is_mastered", false);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function setMastered(id, mastered = true) {
    const user = await requireUser();
    if (!user) return false;
    const { error } = await client().from("wrong_questions")
      .update({ is_mastered: Boolean(mastered), updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return true;
  }

  async function getBookmarks() {
    const user = await requireUser();
    if (!user) return [];
    const { data, error } = await client().from("bookmarks").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function toggleBookmark(subject, questionId) {
    const user = await requireUser();
    if (!user) return { saved: false, reason: "not_signed_in" };

    const { data: existing, error: findError } = await client()
      .from("bookmarks").select("id")
      .eq("user_id", user.id)
      .eq("subject", String(subject))
      .eq("question_id", String(questionId))
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      const { error } = await client().from("bookmarks").delete()
        .eq("id", existing.id).eq("user_id", user.id);
      if (error) throw error;
      return { saved: true, bookmarked: false };
    }

    const { error } = await client().from("bookmarks").insert({
      user_id: user.id,
      subject: String(subject),
      question_id: String(questionId)
    });
    if (error) throw error;
    return { saved: true, bookmarked: true };
  }

  async function saveSession(session) {
    const user = await requireUser();
    if (!user) return { saved: false, reason: "not_signed_in" };

    const payload = {
      user_id: user.id,
      subject: String(session.subject || "未分類"),
      quiz_name: String(session.quiz_name || session.subject || "測驗"),
      question_ids: session.question_ids || [],
      answers: session.answers || {},
      current_index: Math.max(0, Number(session.current_index || 0)),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client().from("quiz_sessions")
      .upsert(payload, { onConflict: "user_id,subject" })
      .select().single();
    if (error) throw error;
    return { saved: true, data };
  }

  async function getSession(subject) {
    const user = await requireUser();
    if (!user) return null;
    const { data, error } = await client().from("quiz_sessions").select("*")
      .eq("user_id", user.id).eq("subject", String(subject))
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function deleteSession(subject) {
    const user = await requireUser();
    if (!user) return false;
    const { error } = await client().from("quiz_sessions").delete()
      .eq("user_id", user.id).eq("subject", String(subject));
    if (error) throw error;
    return true;
  }

  window.StudyData = {
    currentUser, saveAttempt, saveWrongQuestions, getAttempts,
    getWrongQuestions, setMastered, getBookmarks, toggleBookmark,
    saveSession, getSession, deleteSession
  };
})();
