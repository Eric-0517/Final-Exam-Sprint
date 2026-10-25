(() => {
    "use strict";

    const BANK_URL = "major1.json";
    const QUESTIONS_PER_QUIZ = 50;
    const POINTS_PER_QUESTION = 2;
    const LETTERS = ["A", "B", "C", "D"];

    const SUBJECT = "09商業與管理群專一";
    const SESSION_SUBJECT = "major1";
    const QUIZ_NAME = "09商業與管理群專一(114-1歷屆模擬試題)";

    const $ = (id) => document.getElementById(id);
    const screens = ["home", "quiz", "result"];

    let questionBank = [];
    let quizQuestions = [];
    let userAnswers = [];
    let currentIndex = 0;
    let sessionSaveQueue = Promise.resolve();
    let quizStartedAt = null;
    let restoringSession = false;

    function showScreen(id) {
        screens.forEach((screenId) => {
            const el = $(screenId);
            if (el) el.classList.toggle("active", screenId === id);
        });
        window.scrollTo(0, 0);
    }

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
            console.error("讀取登入狀態失敗：", error);
            return null;
        }
    }

    function makeAnswerMap() {
        const answers = {};
        quizQuestions.forEach((question, index) => {
            if (userAnswers[index]) {
                answers[question.id] = userAnswers[index];
            }
        });
        return answers;
    }

    function makeQuestionIds() {
        return quizQuestions.map((question) => question.id);
    }

    function saveSession() {
        if (restoringSession || !quizQuestions.length) {
            return Promise.resolve();
        }

        sessionSaveQueue = sessionSaveQueue.then(async () => {
            const user = await getCurrentUser();
            const studyData = getStudyData();

            if (!user || !studyData?.saveSession) return;

            const result = await studyData.saveSession({
                subject: SESSION_SUBJECT,
                quiz_name: QUIZ_NAME,
                question_ids: makeQuestionIds(),
                answers: makeAnswerMap(),
                current_index: currentIndex
            });

            if (result?.error || result?.saved === false) {
                console.error("未完成測驗儲存失敗：", result.error || result);
            }
        }).catch((error) => {
            console.error("未完成測驗儲存失敗：", error);
        });

        return sessionSaveQueue;
    }

    async function deleteSession() {
        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user || !studyData?.deleteSession) return;

        const result = await studyData.deleteSession(SESSION_SUBJECT);

        if (result?.error || result?.saved === false) {
            throw new Error("刪除未完成測驗紀錄失敗。");
        }
    }

    async function restoreSavedSession() {
        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user || !studyData?.getSession) return false;

        try {
            const result = await studyData.getSession(SESSION_SUBJECT);

            if (result?.error) throw result.error;

            const session = result?.data || result?.session || result;

            if (!session || !Array.isArray(session.question_ids) ||
                session.question_ids.length === 0) {
                return false;
            }

            const questionMap = new Map(
                questionBank.map((question) => [String(question.id), question])
            );

            const savedQuestions = session.question_ids
                .map((id) => questionMap.get(String(id)))
                .filter(Boolean);

            if (!savedQuestions.length) return false;

            const shouldRestore = confirm(
                "發現尚未完成的測驗：\n" +
                QUIZ_NAME + "\n\n" +
                "已儲存 " + savedQuestions.length + " 題，" +
                "目前題號 " +
                Math.min(
                    Number(session.current_index || 0) + 1,
                    savedQuestions.length
                ) + "。\n\n" +
                "是否繼續上次的測驗？"
            );

            if (!shouldRestore) {
                return false;
            }

            restoringSession = true;

            quizQuestions = savedQuestions;
            userAnswers = new Array(quizQuestions.length).fill(null);

            const savedAnswers = session.answers || {};

            quizQuestions.forEach((question, index) => {
                const answer = savedAnswers[question.id];
                if (LETTERS.includes(answer)) {
                    userAnswers[index] = answer;
                }
            });

            currentIndex = Math.max(
                0,
                Math.min(
                    Number(session.current_index || 0),
                    quizQuestions.length - 1
                )
            );

            quizStartedAt = Date.now();
            showScreen("quiz");
            renderQuestion();

            restoringSession = false;
            return true;
        } catch (error) {
            restoringSession = false;
            console.error("恢復未完成測驗失敗：", error);
            alert("讀取未完成測驗失敗，請稍後再試。");
            return false;
        }
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

        if (className === "option-image" ||
            className === "review-option-image") {
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
                    id: String(question.id || "exam-" + (index + 1)),
                    question: String(question.question || "").trim(),
                    image: question.image || "",
                    options,
                    optionImages: question.optionImages || {},
                    answer: String(question.answer || "")
                        .trim().toUpperCase(),
                    explanation: typeof question.explanation === "string"
                        ? question.explanation
                        : ""
                };
            }).filter((question) =>
                question.question &&
                LETTERS.every(
                    (letter) => question.options[letter] !== undefined
                )
            );

            if (!questionBank.length) {
                throw new Error("沒有格式正確的選擇題。");
            }

            if ($("bankCount")) {
                $("bankCount").textContent = questionBank.length;
            }

            await restoreSavedSession();
        } catch (error) {
            if ($("bankCount")) {
                $("bankCount").textContent = "載入失敗";
            }
            console.error(error);
            alert("題庫載入失敗，請確認 major1.json 是否存在且格式正確。");
        }
    }

    async function startQuiz() {
        if (!questionBank.length) {
            alert("目前沒有可作答的題目或題庫尚未載入完成。");
            return;
        }

        if (quizQuestions.length &&
            currentIndex >= 0 &&
            $("quiz")?.classList.contains("active")) {
            if (!confirm("確定要重新開始？目前作答內容將被取代。")) {
                return;
            }
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
        await saveSession();
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
                userAnswers[currentIndex] = letter;
                renderQuestion();
                saveSession();
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

    async function saveCompletedQuiz(correct, total) {
        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user || !studyData) return;

        const answerMap = makeAnswerMap();
        const duration = quizStartedAt
            ? Math.max(0, Math.floor((Date.now() - quizStartedAt) / 1000))
            : 0;

        const errors = [];

        try {
            if (typeof studyData.saveAttempt === "function") {
                const result = await studyData.saveAttempt({
                    subject: SUBJECT,
                    quiz_name: QUIZ_NAME,
                    total_questions: total,
                    correct_count: correct,
                    score: correct * POINTS_PER_QUESTION,
                    answers: answerMap,
                    duration_seconds: duration
                });

                if (result?.error || result?.saved === false) {
                    throw result.error || new Error("成績儲存失敗");
                }
            } else {
                errors.push("找不到成績儲存功能");
            }
        } catch (error) {
            console.error("成績同步失敗：", error);
            errors.push("成績");
        }

        try {
            if (typeof studyData.saveWrongQuestions === "function") {
                const result = await studyData.saveWrongQuestions(
                    SUBJECT,
                    quizQuestions,
                    answerMap
                );

                if (result?.error || result?.saved === false) {
                    throw result.error || new Error("錯題儲存失敗");
                }
            } else {
                errors.push("找不到錯題儲存功能");
            }
        } catch (error) {
            console.error("錯題同步失敗：", error);
            errors.push("錯題");
        }

        if (errors.length) {
            alert(
                "測驗已完成，但雲端同步有部分失敗：" +
                errors.join("、") +
                "。請確認登入狀態及 Supabase 設定。"
            );
            return;
        }

        try {
            await deleteSession();
        } catch (error) {
            console.error(error);
            alert("成績已處理，但未完成測驗紀錄未能刪除。");
        }
    }

    async function finishQuiz() {
        const total = quizQuestions.length;
        let correct = 0;

        quizQuestions.forEach((question, index) => {
            if (userAnswers[index] === question.answer) correct++;
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
                const answer = question.answer;

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
                        "專一題目圖片",
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
                        document.createTextNode(question.options[letter] || "")
                    );

                    const image = createImage(
                        question.optionImages?.[letter],
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

        await sessionSaveQueue;
        await saveCompletedQuiz(correct, total);
    }

    document.addEventListener("click", async (e) => {
        const actionEl = e.target.closest("[data-action]");
        if (!actionEl) return;

        const action = actionEl.dataset.action;

        if (action === "start") {
            await startQuiz();
        } else if (action === "home") {
            showScreen("home");
        } else if (action === "quit") {
            if (confirm("確定要退出測驗嗎？登入後會保留目前作答進度。")) {
                await saveSession();
                showScreen("home");
            }
        }
    });

    if ($("prevBtn")) {
        $("prevBtn").addEventListener("click", async () => {
            if (currentIndex > 0) {
                currentIndex--;
                renderQuestion();
                await saveSession();
            }
        });
    }

    if ($("nextBtn")) {
        $("nextBtn").addEventListener("click", async () => {
            if (!quizQuestions.length) return;

            if (!userAnswers[currentIndex]) {
                alert("請先選擇答案。");
                return;
            }

            if (currentIndex < quizQuestions.length - 1) {
                currentIndex++;
                renderQuestion();
                await saveSession();
            } else {
                await finishQuiz();
            }
        });
    }

    loadBank();
})();
