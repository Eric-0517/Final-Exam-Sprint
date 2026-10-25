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
    let savingSession = false;
    let sessionSaveTimer = null;

    function getStudyData() {
        return window.StudyData ||
            (typeof StudyData !== "undefined" ? StudyData : null);
    }

    async function getCurrentUser() {
        try {
            if (!window.sb || !window.sb.auth) return null;

            const { data, error } = await window.sb.auth.getSession();

            if (error) {
                console.error("取得登入狀態失敗：", error);
                return null;
            }

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

    async function saveSession() {
        if (!quizQuestions.length || savingSession) return;

        const studyData = getStudyData();
        if (!studyData || typeof studyData.saveSession !== "function") {
            return;
        }

        const user = await getCurrentUser();
        if (!user) return;

        savingSession = true;

        try {
            await studyData.saveSession({
                subject: SESSION_SUBJECT,
                quiz_name: QUIZ_NAME,
                question_ids: quizQuestions.map((question) => question.id),
                answers: getAnswerMap(),
                current_index: currentIndex
            });
        } catch (error) {
            console.error("保存測驗進度失敗：", error);
        } finally {
            savingSession = false;
        }
    }

    function scheduleSessionSave() {
        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
        }

        sessionSaveTimer = setTimeout(() => {
            saveSession();
        }, 350);
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
            const session = result?.data || result?.session || result;

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
                "偵測到尚未完成的專二測驗進度，是否繼續上次的測驗？"
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

        quizQuestions = questionBank.slice(
            0,
            Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
        );

        userAnswers = new Array(quizQuestions.length).fill(null);
        currentIndex = 0;
        quizStartedAt = Date.now();

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
        if (!studyData) return;

        const user = await getCurrentUser();
        if (!user) {
            alert("測驗已完成。登入後才能將成績與錯題同步至雲端。");
            return;
        }

        const score = correct * POINTS_PER_QUESTION;
        const durationSeconds = quizStartedAt
            ? Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000))
            : 0;

        try {
            if (typeof studyData.saveAttempt === "function") {
                await studyData.saveAttempt({
                    subject: SUBJECT,
                    quiz_name: QUIZ_NAME,
                    total_questions: total,
                    correct_count: correct,
                    score,
                    answers: getAnswerMap(),
                    duration_seconds: durationSeconds
                });
            }

            if (
                typeof studyData.saveWrongQuestions === "function" &&
                wrongQuestions.length
            ) {
                await studyData.saveWrongQuestions(
                    SUBJECT,
                    wrongQuestions,
                    getAnswerMap()
                );
            }

            if (typeof studyData.deleteSession === "function") {
                await studyData.deleteSession(SESSION_SUBJECT);
            }
        } catch (error) {
            console.error("同步測驗資料失敗：", error);
            alert(
                "測驗已完成，但雲端同步可能未成功。請確認網路與登入狀態，之後再查看成績。"
            );
        }
    }

    function finishQuiz() {
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

        saveCompletedQuiz(correct, total, wrongQuestions);
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
            if (confirm("確定要退出測驗嗎？目前作答進度會保留，之後可繼續。")) {
                scheduleSessionSave();
                showScreen("home");
            }
        }
    });

    if ($("prevBtn")) {
        $("prevBtn").addEventListener("click", () => {
            if (currentIndex > 0) {
                currentIndex--;
                renderQuestion();
                scheduleSessionSave();
            }
        });
    }

    if ($("nextBtn")) {
        $("nextBtn").addEventListener("click", () => {
            if (!quizQuestions.length) return;

            if (!userAnswers[currentIndex]) {
                alert("請先選擇答案。");
                return;
            }

            if (currentIndex < quizQuestions.length - 1) {
                currentIndex++;
                renderQuestion();
                scheduleSessionSave();
            } else {
                if (sessionSaveTimer) {
                    clearTimeout(sessionSaveTimer);
                    sessionSaveTimer = null;
                }

                finishQuiz();
            }
        });
    }

    window.addEventListener("beforeunload", () => {
        if (quizQuestions.length && $("quiz")?.classList.contains("active")) {
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
