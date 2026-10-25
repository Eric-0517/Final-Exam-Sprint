(() => {
    "use strict";

    const BANK_URL = "IntroductiontoBusiness.json";
    const QUESTIONS_PER_QUIZ = 40;
    const POINTS_PER_QUESTION = 2.5;
    const LETTERS = ["A", "B", "C", "D"];

    const SUBJECT = "商業概論";
    const SESSION_SUBJECT = "IntroductiontoBusiness";
    const QUIZ_NAME = "商業概論(第1次模擬考)啟芳";

    const $ = (id) => document.getElementById(id);
    const screens = ["home", "quiz", "result"];

    let questionBank = [];
    let quizQuestions = [];
    let userAnswers = [];
    let currentIndex = 0;
    let quizStartedAt = 0;
    let savingSession = Promise.resolve();
    let finishingQuiz = false;

    function showScreen(id) {
        screens.forEach((screenId) => {
            $(screenId).classList.toggle("active", screenId === id);
        });
        window.scrollTo(0, 0);
    }

    function shuffle(items) {
        const result = items.slice();

        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }

        return result;
    }

    function getStudyData() {
        return window.StudyData || null;
    }

    async function isSignedIn() {
        try {
            if (!window.sb?.auth) return false;

            const { data, error } = await window.sb.auth.getSession();

            if (error) return false;

            return Boolean(data?.session?.user);
        } catch (error) {
            console.error("讀取登入狀態失敗：", error);
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

    function renderQuestionContent(container, question, review = false) {
        container.innerHTML = "";

        const image = createImage(
            question.image,
            "題目圖片",
            review ? "review-question-image" : "question-image"
        );

        if (image) container.appendChild(image);

        const prompt = document.createElement("div");
        prompt.className = review ? "review-question-text" : "";
        prompt.textContent = question.question || "";
        container.appendChild(prompt);
    }

    function showLoadError(message) {
        const errorBox = $("loadError");

        if (errorBox) {
            errorBox.hidden = false;
            errorBox.textContent = message;
        }
    }

    async function loadBank() {
        const startButton = $("startBtn");
        startButton.disabled = true;

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
                    id: String(question.id || "business-" + (index + 1)),
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
            }).filter((question) =>
                question.question &&
                LETTERS.every((letter) =>
                    question.options[letter] !== undefined
                ) &&
                LETTERS.includes(question.answer)
            );

            if (!questionBank.length) {
                throw new Error("沒有格式正確的選擇題。");
            }

            $("bankCount").textContent = questionBank.length;
            startButton.disabled = false;

            if ($("loadError")) {
                $("loadError").hidden = true;
                $("loadError").textContent = "";
            }
        } catch (error) {
            $("bankCount").textContent = "載入失敗";
            startButton.disabled = true;

            showLoadError(
                error.message +
                " 請確認 HTML、JS、JSON 與圖片資料夾都已上傳。"
            );

            console.error("商業概論題庫載入失敗：", error);
        }
    }

    function getAnswerMap() {
        const answers = {};

        quizQuestions.forEach((question, index) => {
            answers[question.id] = userAnswers[index] || null;
        });

        return answers;
    }

    function queueSaveSession() {
        savingSession = savingSession
            .catch(() => {})
            .then(async () => {
                const studyData = getStudyData();

                if (
                    !studyData ||
                    typeof studyData.saveSession !== "function" ||
                    !quizQuestions.length ||
                    !(await isSignedIn())
                ) {
                    return;
                }

                const result = await studyData.saveSession({
                    subject: SESSION_SUBJECT,
                    quiz_name: QUIZ_NAME,
                    question_ids: quizQuestions.map((question) => question.id),
                    answers: getAnswerMap(),
                    current_index: currentIndex
                });

                if (result && result.saved === false) {
                    console.warn("商業概論測驗進度尚未同步：", result);
                }
            })
            .catch((error) => {
                console.error("儲存商業概論測驗進度失敗：", error);
            });

        return savingSession;
    }

    async function deleteSavedSession() {
        const studyData = getStudyData();

        if (
            !studyData ||
            typeof studyData.deleteSession !== "function" ||
            !(await isSignedIn())
        ) {
            return;
        }

        try {
            await studyData.deleteSession(SESSION_SUBJECT);
        } catch (error) {
            console.error("刪除商業概論測驗進度失敗：", error);
        }
    }

    function normalizeSession(result) {
        if (!result) return null;

        if (result.data && !Array.isArray(result.data)) {
            return result.data;
        }

        if (result.session) {
            return result.session;
        }

        return result;
    }

    async function restoreSavedSession() {
        const studyData = getStudyData();

        if (
            !studyData ||
            typeof studyData.getSession !== "function" ||
            !(await isSignedIn())
        ) {
            return false;
        }

        try {
            await savingSession;

            const result = await studyData.getSession(SESSION_SUBJECT);
            const session = normalizeSession(result);

            if (
                !session ||
                !Array.isArray(session.question_ids) ||
                !session.question_ids.length
            ) {
                return false;
            }

            const savedQuestions = session.question_ids.map((id) =>
                questionBank.find((question) => question.id === String(id))
            );

            if (
                savedQuestions.some((question) => !question) ||
                savedQuestions.length > QUESTIONS_PER_QUIZ
            ) {
                await deleteSavedSession();
                return false;
            }

            const savedAnswers = session.answers || {};

            const hasAnswers = savedQuestions.some((question) =>
                savedAnswers[question.id] === "A" ||
                savedAnswers[question.id] === "B" ||
                savedAnswers[question.id] === "C" ||
                savedAnswers[question.id] === "D"
            );

            if (
                !confirm(
                    "偵測到尚未完成的測驗進度" +
                    (hasAnswers ? "\n是否恢復上次的作答進度？" :
                        "\n是否恢復上次的測驗？")
                )
            ) {
                await deleteSavedSession();
                return false;
            }

            quizQuestions = savedQuestions;
            userAnswers = quizQuestions.map((question) => {
                const answer = savedAnswers[question.id];

                return LETTERS.includes(answer) ? answer : null;
            });

            currentIndex = Math.max(
                0,
                Math.min(
                    Number(session.current_index) || 0,
                    quizQuestions.length - 1
                )
            );

            quizStartedAt = Date.now();

            $("total").textContent = quizQuestions.length;
            showScreen("quiz");
            renderQuestion();

            return true;
        } catch (error) {
            console.error("恢復測驗失敗：", error);
            return false;
        }
    }

    async function startQuiz() {
        if (!questionBank.length) {
            alert("目前沒有可作答的題目。");
            return;
        }

        if (await restoreSavedSession()) {
            return;
        }

        quizQuestions = shuffle(questionBank).slice(
            0,
            Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
        );

        userAnswers = new Array(quizQuestions.length).fill(null);
        currentIndex = 0;
        quizStartedAt = Date.now();
        finishingQuiz = false;

        $("total").textContent = quizQuestions.length;

        showScreen("quiz");
        renderQuestion();
        queueSaveSession();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];

        if (!question) return;

        $("qNo").textContent = currentIndex + 1;
        $("total").textContent = quizQuestions.length;

        $("progressBar").style.width =
            ((currentIndex + 1) / quizQuestions.length * 100) + "%";

        renderQuestionContent($("questionText"), question);

        const optionsBox = $("options");
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
                question.optionImages[letter],
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
                queueSaveSession();
            });

            optionsBox.appendChild(button);
        });

        $("prevBtn").disabled = currentIndex === 0;

        $("nextBtn").textContent =
            currentIndex === quizQuestions.length - 1
                ? "交卷並看結果"
                : "下一題";
    }

    function renderResults(correct, wrong) {
        const total = quizQuestions.length;

        $("score").textContent = (correct * POINTS_PER_QUESTION)
            .toFixed(1)
            .replace(/\.0$/, "");

        if ($("scoreLabel")) {
            $("scoreLabel").textContent = "分（滿分 100 分）";
        }

        $("correctCount").textContent = correct;
        $("wrongCount").textContent = wrong;
        $("accuracy").textContent =
            (total ? Math.round(correct / total * 100) : 0) + "%";

        if ($("gradingNotice")) {
            $("gradingNotice").textContent =
                "已完成自動批改，共 " + total +
                " 題，每題 " + POINTS_PER_QUESTION +
                " 分，未作答的題目計為答錯。";
        }

        $("wrongSummary").textContent = "共 " + wrong + " 題錯題";

        const wrongList = $("wrongList");
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

            const questionContent = document.createElement("div");
            questionContent.className = "review-question";

            renderQuestionContent(questionContent, question, true);
            item.appendChild(questionContent);

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

            if (question.explanation.trim()) {
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

    async function saveCompletedQuiz(correct, wrong) {
        const studyData = getStudyData();

        if (!studyData) {
            console.warn("StudyData 未載入，無法同步雲端資料。");
            return;
        }

        if (!(await isSignedIn())) {
            console.info("目前未登入，測驗結果僅顯示在本頁。");
            return;
        }

        const total = quizQuestions.length;
        const score = correct * POINTS_PER_QUESTION;
        const durationSeconds = quizStartedAt
            ? Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000))
            : 0;

        const answerMap = getAnswerMap();

        const attempt = {
            subject: SUBJECT,
            quiz_name: QUIZ_NAME,
            total_questions: total,
            correct_count: correct,
            score,
            answers: answerMap,
            duration_seconds: durationSeconds
        };

        const errors = [];

        if (typeof studyData.saveAttempt === "function") {
            try {
                const result = await studyData.saveAttempt(attempt);

                if (result && result.saved === false) {
                    errors.push("成績未成功儲存");
                }
            } catch (error) {
                errors.push("成績儲存失敗");
                console.error("儲存商業概論成績失敗：", error);
            }
        } else {
            errors.push("找不到 saveAttempt 函式");
        }

        if (typeof studyData.saveWrongQuestions === "function") {
            try {
                const result = await studyData.saveWrongQuestions(
                    SUBJECT,
                    quizQuestions,
                    answerMap
                );

                if (result && result.saved === false) {
                    errors.push("錯題未成功儲存");
                }
            } catch (error) {
                errors.push("錯題儲存失敗");
                console.error("儲存商業概論錯題失敗：", error);
            }
        } else {
            errors.push("找不到 saveWrongQuestions 函式");
        }

        if (errors.length === 0) {
            await deleteSavedSession();
        }

        if (errors.length > 0) {
            console.error("商業概論雲端儲存結果：", errors);

            alert(
                "本次測驗已完成，但部分雲端資料可能未成功儲存。\n" +
                errors.join("、") +
                "。分數仍會顯示，請檢查 Supabase 設定及主控台錯誤。"
            );
        }
    }

    async function finishQuiz() {
        if (finishingQuiz || !quizQuestions.length) return;

        finishingQuiz = true;
        $("nextBtn").disabled = true;

        try {
            let correct = 0;

            quizQuestions.forEach((question, index) => {
                if (userAnswers[index] === question.answer) {
                    correct++;
                }
            });

            const wrong = quizQuestions.length - correct;

            renderResults(correct, wrong);
            showScreen("result");

            await savingSession;
            await saveCompletedQuiz(correct, wrong);
        } finally {
            $("nextBtn").disabled = false;
            finishingQuiz = false;
        }
    }

    $("startBtn").addEventListener("click", startQuiz);

    $("prevBtn").addEventListener("click", () => {
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion();
            queueSaveSession();
        }
    });

    $("nextBtn").addEventListener("click", () => {
        if (!quizQuestions.length || finishingQuiz) return;

        if (currentIndex < quizQuestions.length - 1) {
            currentIndex++;
            renderQuestion();
            queueSaveSession();
        } else {
            finishQuiz();
        }
    });

    $("quitBtn").addEventListener("click", async () => {
        if (
            confirm(
                "確定要退出測驗嗎？\n" +
                "已登入的帳號會保留目前作答進度，下次可選擇恢復。"
            )
        ) {
            await queueSaveSession();
            showScreen("home");
        }
    });

    $("homeBtn").addEventListener("click", () => {
        showScreen("home");
    });

    $("againBtn").addEventListener("click", async () => {
        await deleteSavedSession();
        startQuiz();
    });

    loadBank();
})();
