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
    let sessionSavePromise = Promise.resolve();
    let sessionSaveTimer = null;
    let quizSubmitted = false;
    let finishingQuiz = false;

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

    function swalBase() {
        return {
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#64748b",
            reverseButtons: true,
            allowOutsideClick: false,
            allowEscapeKey: false
        };
    }

    async function showAlert({
        title,
        text = "",
        icon = "info",
        confirmText = "確定"
    }) {
        if (typeof Swal === "undefined") {
            window.alert([title, text].filter(Boolean).join("\n\n"));
            return;
        }

        return Swal.fire({
            ...swalBase(),
            title,
            text,
            icon,
            confirmButtonText: confirmText
        });
    }

    async function confirmAction({
        title,
        text = "",
        icon = "question",
        confirmText = "確定",
        cancelText = "取消"
    }) {
        if (typeof Swal === "undefined") {
            return window.confirm(
                [title, text].filter(Boolean).join("\n\n")
            );
        }

        const result = await Swal.fire({
            ...swalBase(),
            title,
            text,
            icon,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            focusCancel: true
        });

        return result.isConfirmed;
    }

    function showScreen(id) {
        screens.forEach((screenId) => {
            const el = $(screenId);

            if (el) {
                el.classList.toggle("active", screenId === id);
            }
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

            questionBank = rawQuestions
                .map((question, index) => {
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
                        explanation:
                            typeof question.explanation === "string"
                                ? question.explanation
                                : ""
                    };
                })
                .filter((question) =>
                    question.question &&
                    LETTERS.every((letter) =>
                        question.options[letter] !== undefined
                    ) &&
                    LETTERS.includes(question.answer)
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

            console.error("專二題庫載入失敗：", error);

            await showAlert({
                title: "題庫載入失敗",
                text: error.message || "請重新整理頁面後再試。",
                icon: "error"
            });
        }
    }

    function getAnswerMap() {
        const answerMap = {};

        quizQuestions.forEach((question, index) => {
            answerMap[question.id] = userAnswers[index] || null;
        });

        return answerMap;
    }

    function isSaveFailure(result) {
        return result === false ||
            result?.error ||
            result?.saved === false ||
            result?.success === false;
    }

    function scheduleSessionSave() {
        if (
            quizSubmitted ||
            finishingQuiz ||
            !quizQuestions.length ||
            !$("quiz")?.classList.contains("active")
        ) {
            return;
        }

        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
        }

        sessionSaveTimer = setTimeout(() => {
            sessionSaveTimer = null;
            saveSession();
        }, 350);
    }

    function saveSession() {
        if (
            !quizQuestions.length ||
            quizSubmitted ||
            finishingQuiz ||
            !$("quiz")?.classList.contains("active")
        ) {
            return sessionSavePromise;
        }

        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
            sessionSaveTimer = null;
        }

        const studyData = getStudyData();

        if (!studyData || typeof studyData.saveSession !== "function") {
            console.error("StudyData.saveSession 尚未載入。");
            return sessionSavePromise;
        }

        const snapshot = {
            subject: SESSION_SUBJECT,
            quiz_name: QUIZ_NAME,
            question_ids: quizQuestions.map((question) => question.id),
            answers: getAnswerMap(),
            current_index: currentIndex
        };

        sessionSavePromise = sessionSavePromise
            .catch(() => {})
            .then(async () => {
                if (quizSubmitted || finishingQuiz) return;

                const user = await getCurrentUser();

                if (!user || quizSubmitted || finishingQuiz) return;

                const result = await studyData.saveSession(snapshot);

                if (isSaveFailure(result)) {
                    console.error("雲端未保存測驗進度：", result);
                }
            })
            .catch((error) => {
                console.error("保存測驗進度失敗：", error);
            });

        return sessionSavePromise;
    }

    async function waitForSessionSave() {
        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
            sessionSaveTimer = null;
        }

        await sessionSavePromise;
    }

    async function deleteCurrentSession() {
        await waitForSessionSave();

        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user) {
            throw new Error("目前未登入，無法確認未完成測驗紀錄是否刪除。");
        }

        if (
            !studyData ||
            typeof studyData.deleteSession !== "function" ||
            typeof studyData.getSession !== "function"
        ) {
            throw new Error("StudyData 的刪除或查詢功能尚未載入。");
        }

        const result = await studyData.deleteSession(SESSION_SUBJECT);

        if (isSaveFailure(result) || result?.deleted === false) {
            throw new Error("雲端未完成測驗紀錄未能確認刪除。");
        }

        const remaining = await studyData.getSession(SESSION_SUBJECT);

        if (remaining?.error) {
            throw new Error("無法確認未完成測驗紀錄是否已刪除。");
        }

        const session = remaining?.data ||
            remaining?.session ||
            remaining;

        if (
            session &&
            Array.isArray(session.question_ids) &&
            session.question_ids.length > 0
        ) {
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
            const result = await studyData.getSession(SESSION_SUBJECT);

            if (result?.error) throw result.error;

            const session = result?.data ||
                result?.session ||
                result;

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

            const restoredQuestions = session.question_ids.map(
                (id) => bankMap.get(String(id))
            );

            if (
                restoredQuestions.some((question) => !question) ||
                restoredQuestions.length > QUESTIONS_PER_QUIZ
            ) {
                await showAlert({
                    title: "無法恢復測驗",
                    text: "儲存的題目與目前題庫不一致，請清除舊進度後重新開始。",
                    icon: "warning"
                });

                return false;
            }

            const shouldRestore = await confirmAction({
                title: "偵測到尚未完成的測驗進度",
                text: "偵測到上次的作答進度，是否繼續上次的測驗？",
                icon: "question",
                confirmText: "繼續測驗",
                cancelText: "重新開始"
            });

            if (!shouldRestore) {
                const shouldDelete = await confirmAction({
                    title: "清除舊的測驗進度？",
                    text: "是否刪除雲端未完成測驗紀錄？",
                    icon: "warning",
                    confirmText: "清除紀錄",
                    cancelText: "保留紀錄"
                });

                if (shouldDelete) {
                    try {
                        await deleteCurrentSession();

                        await showAlert({
                            title: "舊進度已清除",
                            text: "未完成測驗紀錄已確認刪除。",
                            icon: "success"
                        });
                    } catch (error) {
                        console.error("刪除舊進度失敗：", error);

                        await showAlert({
                            title: "清除失敗",
                            text: error.message,
                            icon: "error"
                        });
                    }
                }

                return false;
            }

            quizQuestions = restoredQuestions;

            const savedAnswers = session.answers || {};

            userAnswers = quizQuestions.map((question) => {
                const value = savedAnswers[question.id];

                return LETTERS.includes(value) ? value : null;
            });

            const savedIndex = Number(session.current_index);

            currentIndex = Number.isInteger(savedIndex)
                ? Math.max(
                    0,
                    Math.min(savedIndex, quizQuestions.length - 1)
                )
                : 0;

            quizStartedAt = Date.now();
            quizSubmitted = false;
            finishingQuiz = false;

            if ($("total")) {
                $("total").textContent = quizQuestions.length;
            }

            showScreen("quiz");
            renderQuestion();

            return true;
        } catch (error) {
            console.error("恢復測驗進度失敗：", error);

            await showAlert({
                title: "恢復測驗失敗",
                text: "讀取測驗進度時發生錯誤，請稍後再試。",
                icon: "error"
            });

            return false;
        }
    }

    async function startQuiz() {
        if (!questionBank.length) {
            await showAlert({
                title: "目前沒有可作答的題目",
                text: "請確認題庫已載入完成。",
                icon: "warning"
            });

            return;
        }

        if (finishingQuiz) return;

        if (
            quizQuestions.length &&
            !$("result")?.classList.contains("active") &&
            $("quiz")?.classList.contains("active") &&
            !quizSubmitted
        ) {
            const shouldRestart = await confirmAction({
                title: "確定要重新開始？",
                text: "目前作答內容將被取代。",
                icon: "warning",
                confirmText: "重新開始",
                cancelText: "繼續作答"
            });

            if (!shouldRestart) return;
        }

        await waitForSessionSave();

        quizQuestions = questionBank.slice(
            0,
            Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
        );

        userAnswers = new Array(quizQuestions.length).fill(null);
        currentIndex = 0;
        quizStartedAt = Date.now();
        quizSubmitted = false;
        finishingQuiz = false;

        if ($("total")) {
            $("total").textContent = quizQuestions.length;
        }

        showScreen("quiz");
        renderQuestion();
        scheduleSessionSave();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];

        if (!question) return;

        if ($("qNo")) {
            $("qNo").textContent = currentIndex + 1;
        }

        if ($("total")) {
            $("total").textContent = quizQuestions.length;
        }

        if ($("progressBar")) {
            $("progressBar").style.width =
                (
                    (currentIndex + 1) /
                    quizQuestions.length *
                    100
                ) + "%";
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
            button.className =
                "option" +
                (
                    userAnswers[currentIndex] === letter
                        ? " selected"
                        : ""
                );

            button.setAttribute(
                "aria-pressed",
                userAnswers[currentIndex] === letter
                    ? "true"
                    : "false"
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
                question.optionImages?.[letter],
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
                if (quizSubmitted || finishingQuiz) return;

                userAnswers[currentIndex] = letter;

                renderQuestion();
                scheduleSessionSave();
            });

            optionsBox.appendChild(button);
        });

        if ($("prevBtn")) {
            $("prevBtn").disabled =
                currentIndex === 0 ||
                quizSubmitted ||
                finishingQuiz;
        }

        if ($("nextBtn")) {
            $("nextBtn").disabled =
                quizSubmitted ||
                finishingQuiz;

            $("nextBtn").textContent =
                currentIndex === quizQuestions.length - 1
                    ? "交卷並看結果"
                    : "下一題";
        }
    }

    async function saveCompletedQuiz(correct, total, wrongQuestions) {
        const studyData = getStudyData();
        const user = await getCurrentUser();

        if (!user) {
            await showAlert({
                title: "測驗完成！",
                text: "本次成績已完成計算，但目前未登入，無法同步至雲端。",
                icon: "info"
            });

            return;
        }

        if (
            !studyData ||
            typeof studyData.saveAttempt !== "function" ||
            typeof studyData.saveWrongQuestions !== "function"
        ) {
            await showAlert({
                title: "雲端同步未完成",
                text: "成績或錯題儲存功能尚未載入。",
                icon: "error"
            });

            return;
        }

        const score = correct * POINTS_PER_QUESTION;

        const durationSeconds = quizStartedAt
            ? Math.max(
                0,
                Math.round((Date.now() - quizStartedAt) / 1000)
            )
            : 0;

        const answerMap = getAnswerMap();

        let attemptSaved = false;
        let wrongSaved = false;

        try {
            const result = await studyData.saveAttempt({
                subject: SUBJECT,
                quiz_name: QUIZ_NAME,
                total_questions: total,
                correct_count: correct,
                score,
                answers: answerMap,
                duration_seconds: durationSeconds
            });

            if (isSaveFailure(result)) {
                throw new Error("成績儲存失敗。");
            }

            attemptSaved = true;
        } catch (error) {
            console.error("儲存成績失敗：", error);
        }

        try {
            const result = await studyData.saveWrongQuestions(
                SUBJECT,
                wrongQuestions,
                answerMap
            );

            if (isSaveFailure(result)) {
                throw new Error("錯題儲存失敗。");
            }

            wrongSaved = true;
        } catch (error) {
            console.error("儲存錯題失敗：", error);
        }

        if (!attemptSaved || !wrongSaved) {
            await showAlert({
                title: "雲端同步未完成",
                text: "本次測驗已完成，但成績或錯題未能確認儲存。請檢查網路與 Supabase 設定。",
                icon: "error"
            });

            return;
        }

        try {
            await deleteCurrentSession();

            await showAlert({
                title: "測驗成績已儲存！",
                text: "本次成績與錯題已同步至雲端，未完成測驗紀錄也已清除。",
                icon: "success"
            });
        } catch (error) {
            console.error("刪除未完成測驗紀錄失敗：", error);

            await showAlert({
                title: "成績已儲存，但進度未清除",
                text:
                    "成績與錯題已成功儲存，但未完成測驗紀錄尚未確認刪除。" +
                    "\n\n原因：" +
                    (error.message || "未知錯誤"),
                icon: "warning"
            });
        }
    }

    async function finishQuiz() {
        if (
            quizSubmitted ||
            finishingQuiz ||
            !quizQuestions.length
        ) {
            return;
        }

        const unanswered = userAnswers.filter(
            (answer) => !answer
        ).length;

        const shouldSubmit = await confirmAction({
            title: unanswered
                ? "還有題目未作答"
                : "確定要交卷？",
            text: unanswered
                ? "還有 " + unanswered +
                  " 題未作答，交卷後會計為答錯。確定交卷嗎？"
                : "交卷後將顯示成績與錯題解析。",
            icon: unanswered ? "warning" : "question",
            confirmText: "確定交卷",
            cancelText: "繼續作答"
        });

        if (!shouldSubmit || quizSubmitted || finishingQuiz) {
            return;
        }

        finishingQuiz = true;

        if ($("nextBtn")) $("nextBtn").disabled = true;
        if ($("prevBtn")) $("prevBtn").disabled = true;

        try {
            await waitForSessionSave();

            if (sessionSaveTimer) {
                clearTimeout(sessionSaveTimer);
                sessionSaveTimer = null;
            }

            quizSubmitted = true;

            const total = quizQuestions.length;
            let correct = 0;
            const wrongQuestions = [];

            quizQuestions.forEach((question, index) => {
                if (userAnswers[index] === question.answer) {
                    correct++;
                } else {
                    wrongQuestions.push(question);
                }
            });

            const wrong = total - correct;

            if ($("score")) {
                $("score").textContent =
                    (correct * POINTS_PER_QUESTION)
                        .toFixed(1)
                        .replace(/\.0$/, "");
            }

            if ($("correctCount")) {
                $("correctCount").textContent = correct;
            }

            if ($("wrongCount")) {
                $("wrongCount").textContent = wrong;
            }

            if ($("accuracy")) {
                $("accuracy").textContent =
                    (total ? Math.round(correct / total * 100) : 0) + "%";
            }

            if ($("wrongSummary")) {
                $("wrongSummary").textContent =
                    "共 " + wrong + " 題錯題";
            }

            const wrongList = $("wrongList");

            if (wrongList) {
                wrongList.innerHTML = "";

                quizQuestions.forEach((question, index) => {
                    const selected = userAnswers[index];

                    if (selected === question.answer) return;

                    const item = document.createElement("article");
                    item.className = "wrong-item";

                    const title = document.createElement("div");
                    title.className = "wrong-question";
                    title.textContent =
                        "第 " + (index + 1) +
                        " 題｜你的答案：" + (selected || "未作答") +
                        "｜正確答案：" + question.answer;

                    item.appendChild(title);

                    const questionText = document.createElement("div");
                    questionText.style.fontWeight = "bold";
                    questionText.style.margin = "8px 0";
                    questionText.style.whiteSpace = "pre-line";
                    questionText.textContent = question.question;

                    item.appendChild(questionText);

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
                            question.optionImages?.[letter],
                            letter + " 選項圖片",
                            "review-option-image"
                        );

                        if (image) p.appendChild(image);

                        if (letter === question.answer) {
                            const mark = document.createElement("strong");
                            mark.textContent = " ✓ 正確答案";
                            mark.style.color = "#dc2626";
                            p.appendChild(mark);
                        }

                        options.appendChild(p);
                    });

                    item.appendChild(options);

                    const explanation = document.createElement("div");
                    explanation.className = "explanation";
                    explanation.textContent =
                        question.explanation?.trim() ||
                        "本題尚未提供詳解。";

                    item.appendChild(explanation);
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

            await saveCompletedQuiz(
                correct,
                total,
                wrongQuestions
            );
        } catch (error) {
            console.error("交卷處理失敗：", error);

            await showAlert({
                title: "交卷處理發生錯誤",
                text: "處理測驗結果時發生問題，請稍後再試。",
                icon: "error"
            });
        } finally {
            finishingQuiz = false;

            if ($("nextBtn")) {
                $("nextBtn").disabled = false;
            }

            if ($("prevBtn")) {
                $("prevBtn").disabled = currentIndex === 0;
            }
        }
    }

    document.addEventListener("click", async (event) => {
        const actionEl = event.target.closest("[data-action]");

        if (!actionEl) return;

        const action = actionEl.dataset.action;

        if (action === "start") {
            await startQuiz();
        } else if (action === "home") {
            if (finishingQuiz) return;
            showScreen("home");
        } else if (action === "quit") {
            if (finishingQuiz || quizSubmitted) return;

            const shouldQuit = await confirmAction({
                title: "確定要退出測驗嗎？",
                text: "登入後會嘗試保留目前作答進度。",
                icon: "warning",
                confirmText: "確定退出",
                cancelText: "繼續作答"
            });

            if (shouldQuit) {
                await saveSession();
                showScreen("home");
            }
        }
    });

    if ($("prevBtn")) {
        $("prevBtn").addEventListener("click", async () => {
            if (quizSubmitted || finishingQuiz) return;

            if (currentIndex > 0) {
                currentIndex--;
                renderQuestion();
                scheduleSessionSave();
            }
        });
    }

    if ($("nextBtn")) {
        $("nextBtn").addEventListener("click", async () => {
            if (
                !quizQuestions.length ||
                quizSubmitted ||
                finishingQuiz
            ) {
                return;
            }

            if (!userAnswers[currentIndex]) {
                await showAlert({
                    title: "請先選擇答案",
                    text: "選擇答案後才能繼續下一題或交卷。",
                    icon: "warning"
                });

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
            !finishingQuiz &&
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
