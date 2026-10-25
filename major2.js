(() => {
    "use strict";

    const BANK_URL = "major2.json";
    const QUESTIONS_PER_QUIZ = 50;
    const POINTS_PER_QUESTION = 2;
    const LETTERS = ["A", "B", "C", "D"];

    const SUBJECT = "09商業與管理群專二";
    const SESSION_SUBJECT = "major2";
    const QUIZ_NAME = "09商業與管理群專二(114-1歷屆模擬試題)";

    const $ = (id) => document.getElementById(id);
    const screens = ["home", "quiz", "result"];

    let questionBank = [];
    let quizQuestions = [];
    let userAnswers = [];
    let currentIndex = 0;
    let quizStartedAt = null;
    let sessionSavePromise = null;
    let sessionSaveTimer = null;
    let quizSubmitted = false;

    function getStudyData() {
        return window.StudyData ||
            (typeof StudyData !== "undefined" ? StudyData : null);
    }

    async function getCurrentUser() {
        try {
            if (!window.sb?.auth) return null;

            const { data, error } = await window.sb.auth.getSession();

            if (error) throw error;

            return data?.session?.user || null;
        } catch (error) {
            console.error("取得登入狀態失敗：", error);
            return null;
        }
    }

    function showScreen(id) {
        screens.forEach((screenId) => {
            const el = $(screenId);
            if (el) el.classList.toggle("active", screenId === id);
        });

        window.scrollTo(0, 0);
    }

    function createImage(src, alt, className) {
        if (typeof src !== "string" || !src.trim()) return null;

        const img = document.createElement("img");
        img.src = new URL(src.trim(), document.baseURI).href;
        img.alt = alt;
        img.className = className;
        img.loading = "eager";
        img.style.display = "block";
        img.style.width = "auto";
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.maxWidth = "100%";
        img.style.margin = "8px auto";

        if (
            className === "option-image" ||
            className === "review-option-image"
        ) {
            img.style.maxWidth = "min(100%, 320px)";
            img.style.maxHeight = "180px";
        } else {
            img.style.maxHeight = "240px";
        }

        img.onerror = () => img.remove();

        return img;
    }

    async function loadBank() {
        try {
            const response = await fetch(BANK_URL, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(
                    "題庫載入失敗（HTTP " + response.status + "）。"
                );
            }

            const data = await response.json();
            const rawQuestions = Array.isArray(data)
                ? data
                : data.questions;

            if (!Array.isArray(rawQuestions)) {
                throw new Error("題庫格式錯誤，找不到題目陣列。");
            }

            questionBank = rawQuestions.map((question, index) => {
                const options = question.options || {};

                return {
                    ...question,
                    id: String(question.id || "exam-" + (index + 1)),
                    question: String(question.question || "").trim(),
                    image: question.image || "",
                    options,
                    optionImages: question.optionImages || {},
                    answer: String(question.answer || "")
                        .trim()
                        .toUpperCase(),
                    explanation: typeof question.explanation === "string"
                        ? question.explanation
                        : ""
                };
            }).filter((question) =>
                question.question &&
                LETTERS.every((letter) =>
                    question.options[letter] !== undefined
                )
            );

            if (!questionBank.length) {
                throw new Error("沒有格式正確的選擇題。");
            }

            if ($("bankCount")) {
                $("bankCount").textContent = questionBank.length;
            }
        } catch (error) {
            if ($("bankCount")) {
                $("bankCount").textContent = "載入失敗";
            }

            console.error(error);
            alert("題庫載入失敗，請重新整理頁面後再試。");
        }
    }

    function getAnswerMap() {
        const answerMap = {};

        quizQuestions.forEach((question, index) => {
            answerMap[question.id] = userAnswers[index] || null;
        });

        return answerMap;
    }

    function saveSession() {
        if (
            !quizQuestions.length ||
            quizSubmitted ||
            !$("quiz")?.classList.contains("active")
        ) {
            return Promise.resolve(false);
        }

        if (sessionSavePromise) return sessionSavePromise;

        const studyData = getStudyData();

        if (!studyData || typeof studyData.saveSession !== "function") {
            console.error("StudyData.saveSession 尚未載入。");
            return Promise.resolve(false);
        }

        const savePromise = (async () => {
            try {
                const user = await getCurrentUser();
                if (!user || quizSubmitted) return false;

                const result = await studyData.saveSession({
                    subject: SESSION_SUBJECT,
                    quiz_name: QUIZ_NAME,
                    question_ids: quizQuestions.map((question) => question.id),
                    answers: getAnswerMap(),
                    current_index: currentIndex
                });

                if (result?.saved === false) {
                    console.error("雲端未保存測驗進度：", result);
                    return false;
                }

                return true;
            } catch (error) {
                console.error("保存測驗進度失敗：", error);
                return false;
            }
        })();

        sessionSavePromise = savePromise;

        savePromise.finally(() => {
            if (sessionSavePromise === savePromise) {
                sessionSavePromise = null;
            }
        });

        return savePromise;
    }

    function scheduleSessionSave() {
        if (quizSubmitted) return;

        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
        }

        sessionSaveTimer = setTimeout(() => {
            sessionSaveTimer = null;
            saveSession();
        }, 350);
    }

    async function waitForSessionSave() {
        while (sessionSavePromise) {
            const pendingSave = sessionSavePromise;
            await pendingSave;
        }
    }

    async function deleteCurrentSession() {
        await waitForSessionSave();

        const studyData = getStudyData();

        if (
            !studyData ||
            typeof studyData.deleteSession !== "function" ||
            typeof studyData.getSession !== "function"
        ) {
            throw new Error("StudyData 的刪除或查詢功能尚未載入。");
        }

        const result = await studyData.deleteSession(SESSION_SUBJECT);

        if (result === false || result?.deleted === false) {
            throw new Error("雲端未完成測驗紀錄未能確認刪除。");
        }

        const remaining = await studyData.getSession(SESSION_SUBJECT);

        if (remaining) {
            throw new Error(
                "刪除後仍查到未完成測驗紀錄，請檢查 Supabase RLS 刪除權限。"
            );
        }

        return true;
    }

    async function restoreSession() {
        const studyData = getStudyData();

        if (!studyData || typeof studyData.getSession !== "function") {
            return false;
        }

        const user = await getCurrentUser();
        if (!user) return false;

        try {
            const session = await studyData.getSession(SESSION_SUBJECT);

            if (
                !session ||
                !Array.isArray(session.question_ids) ||
                session.question_ids.length === 0
            ) {
                return false;
            }

            const bankMap = new Map(
                questionBank.map((question) => [
                    String(question.id),
                    question
                ])
            );

            const restoredQuestions = session.question_ids
                .map((id) => bankMap.get(String(id)))
                .filter(Boolean);

            if (!restoredQuestions.length) return false;

            const shouldRestore = confirm(
                "偵測到尚未完成的測驗進度，是否繼續上次的測驗？"
            );

            if (!shouldRestore) return false;

            quizQuestions = restoredQuestions;
            const savedAnswers = session.answers || {};

            userAnswers = quizQuestions.map((question) => {
                const value = savedAnswers[question.id];
                return LETTERS.includes(value) ? value : null;
            });

            const savedIndex = Number(session.current_index);

            currentIndex = Number.isInteger(savedIndex)
                ? Math.max(0, Math.min(savedIndex, quizQuestions.length - 1))
                : 0;

            quizStartedAt = Date.now();
            quizSubmitted = false;

            showScreen("quiz");
            renderQuestion();

            return true;
        } catch (error) {
            console.error("恢復測驗進度失敗：", error);
            return false;
        }
    }

    function startQuiz() {
        if (!questionBank.length) {
            alert("目前沒有可作答的題目或題庫尚未載入完成。");
            return;
        }

        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
            sessionSaveTimer = null;
        }

        quizQuestions = questionBank.slice(
            0,
            Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
        );

        userAnswers = new Array(quizQuestions.length).fill(null);
        currentIndex = 0;
        quizStartedAt = Date.now();
        quizSubmitted = false;

        showScreen("quiz");
        renderQuestion();
        scheduleSessionSave();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];
        if (!question) return;

        if ($("qNo")) $("qNo").textContent = currentIndex + 1;
        if ($("total")) $("total").textContent = quizQuestions.length;

        if ($("progressBar")) {
            $("progressBar").style.width =
                ((currentIndex + 1) / quizQuestions.length * 100) + "%";
        }

        const textEl = $("questionText");

        if (textEl) {
            textEl.textContent = question.question;
            textEl.style.whiteSpace = "pre-line";
        }

        const imgEl = $("questionImage");

        if (imgEl) {
            if (question.image && question.image.trim()) {
                imgEl.src = new URL(
                    question.image.trim(),
                    document.baseURI
                ).href;

                imgEl.style.display = "block";
                imgEl.onerror = () => {
                    imgEl.style.display = "none";
                };
            } else {
                imgEl.removeAttribute("src");
                imgEl.style.display = "none";
            }
        }

        const optionsBox = $("options");
        if (!optionsBox) return;

        optionsBox.innerHTML = "";

        LETTERS.forEach((letter) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option" +
                (userAnswers[currentIndex] === letter ? " selected" : "");

            button.setAttribute(
                "aria-pressed",
                userAnswers[currentIndex] === letter ? "true" : "false"
            );

            const key = document.createElement("span");
            key.className = "option-key";
            key.textContent = letter;

            const content = document.createElement("span");
            content.className = "option-text";
            content.textContent = question.options[letter] || "";

            button.appendChild(key);
            button.appendChild(content);

            const image = createImage(
                question.optionImages && question.optionImages[letter],
                letter + " 選項圖片",
                "option-image"
            );

            if (image) {
                const wrapper = document.createElement("span");
                wrapper.className = "option-text";
                wrapper.appendChild(image);
                button.appendChild(wrapper);
            }

            button.addEventListener("click", () => {
                if (quizSubmitted) return;

                userAnswers[currentIndex] = letter;
                renderQuestion();
                scheduleSessionSave();
            });

            optionsBox.appendChild(button);
        });

        if ($("prevBtn")) {
            $("prevBtn").disabled = currentIndex === 0;
        }

        if ($("nextBtn")) {
            $("nextBtn").textContent =
                currentIndex === quizQuestions.length - 1
                    ? "交卷並看結果"
                    : "下一題";
        }
    }

    async function saveCompletedQuiz(correct, total, wrongQuestions) {
        const studyData = getStudyData();

        if (!studyData) {
            console.error("StudyData 尚未載入。");
            alert("測驗已完成，但雲端同步模組尚未載入。");
            return;
        }

        const user = await getCurrentUser();

        if (!user) {
            alert("測驗已完成。登入後才能將成績與錯題同步至雲端。");
            return;
        }

        const score = correct * POINTS_PER_QUESTION;
        const durationSeconds = quizStartedAt
            ? Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000))
            : 0;

        let attemptSaved = false;
        let wrongSaved = false;
        let sessionDeleted = false;

        try {
            const result = await studyData.saveAttempt({
                subject: SUBJECT,
                quiz_name: QUIZ_NAME,
                total_questions: total,
                correct_count: correct,
                score,
                answers: getAnswerMap(),
                duration_seconds: durationSeconds
            });

            attemptSaved = result?.saved === true;

            if (!attemptSaved) {
                throw new Error("測驗成績未成功儲存。");
            }
        } catch (error) {
            console.error("儲存測驗成績失敗：", error);
        }

        try {
            const result = await studyData.saveWrongQuestions(
                SUBJECT,
                wrongQuestions,
                getAnswerMap()
            );

            wrongSaved = result?.saved === true;

            if (!wrongSaved) {
                throw new Error("錯題資料未成功儲存。");
            }
        } catch (error) {
            console.error("儲存錯題失敗：", error);
        }

        try {
            await deleteCurrentSession();
            sessionDeleted = true;
        } catch (error) {
            console.error("刪除未完成測驗紀錄失敗：", error);
        }

        if (!sessionDeleted) {
            alert(
                "測驗已交卷，但未完成紀錄尚未確認刪除。請開啟瀏覽器 Console 查看錯誤訊息。"
            );
            return;
        }

        if (attemptSaved && wrongSaved && sessionDeleted) {
            alert("測驗成績已儲存！");
        } else if (!attemptSaved || !wrongSaved) {
            alert(
                "未完成紀錄已刪除，但成績或錯題可能未完整同步，請檢查 Console 錯誤訊息。"
            );
        }
    }

    async function finishQuiz() {
        if (quizSubmitted || !quizQuestions.length) return;

        quizSubmitted = true;

        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
            sessionSaveTimer = null;
        }

        await waitForSessionSave();

        const total = quizQuestions.length;
        let correct = 0;
        const wrongQuestions = [];

        quizQuestions.forEach((question, index) => {
            const answer = String(question.answer || "")
                .trim()
                .toUpperCase();

            if (userAnswers[index] === answer) {
                correct++;
            } else {
                wrongQuestions.push(question);
            }
        });

        const wrong = total - correct;

        if ($("score")) {
            $("score").textContent = (correct * POINTS_PER_QUESTION)
                .toFixed(1)
                .replace(/\.0$/, "");
        }

        if ($("correctCount")) $("correctCount").textContent = correct;
        if ($("wrongCount")) $("wrongCount").textContent = wrong;

        if ($("accuracy")) {
            $("accuracy").textContent =
                (total ? Math.round(correct / total * 100) : 0) + "%";
        }

        if ($("wrongSummary")) {
            $("wrongSummary").textContent = "共 " + wrong + " 題錯題";
        }

        const wrongList = $("wrongList");

        if (wrongList) {
            wrongList.innerHTML = "";

            quizQuestions.forEach((question, index) => {
                const selected = userAnswers[index];
                const answer = String(question.answer || "")
                    .trim()
                    .toUpperCase();

                if (selected === answer) return;

                const item = document.createElement("article");
                item.className = "wrong-item";

                const title = document.createElement("div");
                title.className = "wrong-question";
                title.textContent =
                    "第 " + (index + 1) +
                    " 題｜你的答案：" + (selected || "未作答") +
                    "｜正確答案：" + answer;

                item.appendChild(title);

                const qTextDiv = document.createElement("div");
                qTextDiv.style.fontWeight = "bold";
                qTextDiv.style.margin = "8px 0";
                qTextDiv.style.whiteSpace = "pre-line";
                qTextDiv.textContent = question.question;
                item.appendChild(qTextDiv);

                if (question.image && question.image.trim()) {
                    const qImg = createImage(
                        question.image,
                        "專二題目圖片",
                        "question-image"
                    );

                    if (qImg) item.appendChild(qImg);
                }

                const options = document.createElement("div");
                options.className = "review-options";

                LETTERS.forEach((letter) => {
                    const p = document.createElement("p");

                    const key = document.createElement("strong");
                    key.textContent = letter + ". ";
                    p.appendChild(key);

                    p.appendChild(
                        document.createTextNode(
                            question.options[letter] || ""
                        )
                    );

                    const image = createImage(
                        question.optionImages &&
                            question.optionImages[letter],
                        letter + " 選項圖片",
                        "review-option-image"
                    );

                    if (image) p.appendChild(image);

                    if (letter === answer) {
                        const mark = document.createElement("strong");
                        mark.textContent = " ✓ 正確答案";
                        mark.style.color = "#dc2626";
                        p.appendChild(mark);
                    }

                    options.appendChild(p);
                });

                item.appendChild(options);

                if (question.explanation && question.explanation.trim()) {
                    const explanation = document.createElement("div");
                    explanation.className = "explanation";
                    explanation.textContent = question.explanation;
                    item.appendChild(explanation);
                }

                wrongList.appendChild(item);
            });

            if (wrong === 0) {
                const notice = document.createElement("div");
                notice.className = "notice";
                notice.textContent = "全部答對，沒有錯題！";
                wrongList.appendChild(notice);
            }
        }

        showScreen("result");

        await saveCompletedQuiz(correct, total, wrongQuestions);
    }

    document.addEventListener("click", (e) => {
        const actionEl = e.target.closest("[data-action]");
        if (!actionEl) return;

        const action = actionEl.dataset.action;

        if (action === "start") {
            startQuiz();
        } else if (action === "home") {
            showScreen("home");
        } else if (action === "quit") {
            if (
                confirm(
                    "確定要退出測驗嗎？目前作答進度會保留，之後可繼續。"
                )
            ) {
                scheduleSessionSave();
                showScreen("home");
            }
        }
    });

    if ($("prevBtn")) {
        $("prevBtn").addEventListener("click", () => {
            if (quizSubmitted) return;

            if (currentIndex > 0) {
                currentIndex--;
                renderQuestion();
                scheduleSessionSave();
            }
        });
    }

    if ($("nextBtn")) {
        $("nextBtn").addEventListener("click", async () => {
            if (!quizQuestions.length || quizSubmitted) return;

            if (!userAnswers[currentIndex]) {
                alert("請先選擇答案。");
                return;
            }

            if (currentIndex < quizQuestions.length - 1) {
                currentIndex++;
                renderQuestion();
                scheduleSessionSave();
            } else {
                await finishQuiz();
            }
        });
    }

    window.addEventListener("beforeunload", () => {
        if (
            !quizSubmitted &&
            quizQuestions.length &&
            $("quiz")?.classList.contains("active")
        ) {
            saveSession();
        }
    });

    async function init() {
        await loadBank();

        if (questionBank.length) {
            await restoreSession();
        }
    }

    init();
})();
