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
    let quizSubmitted = false;
    let finishingQuiz = false;

    function swalBase() {
        return {
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#64748b",
            reverseButtons: true,
            allowOutsideClick: false,
            allowEscapeKey: false
        };
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
        if (
            restoringSession ||
            quizSubmitted ||
            finishingQuiz ||
            !quizQuestions.length
        ) {
            return sessionSaveQueue;
        }

        sessionSaveQueue = sessionSaveQueue
            .catch(() => {})
            .then(async () => {
                if (
                    restoringSession ||
                    quizSubmitted ||
                    finishingQuiz
                ) {
                    return;
                }

                const user = await getCurrentUser();
                const studyData = getStudyData();

                if (!user || typeof studyData?.saveSession !== "function") {
                    return;
                }

                if (quizSubmitted || finishingQuiz) {
                    return;
                }

                const result = await studyData.saveSession({
                    subject: SESSION_SUBJECT,
                    quiz_name: QUIZ_NAME,
                    question_ids: makeQuestionIds(),
                    answers: makeAnswerMap(),
                    current_index: currentIndex
                });

                if (
                    result === false ||
                    result?.error ||
                    result?.saved === false
                ) {
                    console.error(
                        "未完成測驗儲存失敗：",
                        result?.error || result
                    );
                }
            })
            .catch((error) => {
                console.error("未完成測驗儲存失敗：", error);
            });

        return sessionSaveQueue;
    }

    async function deleteSession() {
        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user) {
            throw new Error(
                "目前未登入，無法紀錄測驗進度。"
            );
        }

        if (typeof studyData?.deleteSession !== "function") {
            throw new Error(
                "找不到刪除未完成測驗紀錄的功能。"
            );
        }

        const result = await studyData.deleteSession(
            SESSION_SUBJECT
        );

        if (
            result === false ||
            result?.error ||
            result?.saved === false ||
            result?.deleted === false
        ) {
            throw new Error(
                result?.error?.message ||
                "刪除未完成測驗紀錄失敗。"
            );
        }

        if (typeof studyData.getSession === "function") {
            const remaining = await studyData.getSession(
                SESSION_SUBJECT
            );

            if (remaining?.error) {
                throw new Error(
                    "無法確認未完成測驗紀錄是否已刪除。"
                );
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
                    "刪除後仍存在未完成測驗紀錄。"
                );
            }
        }

        return true;
    }

    async function restoreSavedSession() {
        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user || typeof studyData?.getSession !== "function") {
            return false;
        }

        try {
            const result = await studyData.getSession(
                SESSION_SUBJECT
            );

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

            const questionMap = new Map(
                questionBank.map((question) => [
                    String(question.id),
                    question
                ])
            );

            const savedQuestions = session.question_ids.map(
                (id) => questionMap.get(String(id))
            );

            if (
                savedQuestions.some((question) => !question) ||
                savedQuestions.length > QUESTIONS_PER_QUIZ
            ) {
                await showAlert({
                    title: "無法恢復測驗",
                    text: "原本的測驗題目與目前題庫不一致，請重新開始測驗。",
                    icon: "warning"
                });

                return false;
            }

            const shouldRestore = await confirmAction({
                title: "發現尚未完成的測驗",
                text:
                    QUIZ_NAME +
                    "\n已儲存 " +
                    savedQuestions.length +
                    " 題，目前題號 " +
                    Math.min(
                        Number(session.current_index || 0) + 1,
                        savedQuestions.length
                    ) +
                    "。\n是否繼續上次的測驗？",
                confirmText: "繼續測驗",
                cancelText: "重新開始"
            });

            if (!shouldRestore) {
                const shouldDelete = await confirmAction({
                    title: "清除舊的測驗進度？",
                    text: "重新開始前，是否清除雲端已儲存的未完成測驗紀錄？",
                    icon: "warning",
                    confirmText: "清除並重新開始",
                    cancelText: "保留紀錄"
                });

                if (shouldDelete) {
                    try {
                        await deleteSession();

                        await showAlert({
                            title: "舊進度已清除",
                            text: "未完成測驗紀錄已確認刪除。",
                            icon: "success"
                        });
                    } catch (error) {
                        console.error(
                            "清除舊測驗紀錄失敗：",
                            error
                        );

                        await showAlert({
                            title: "無法清除舊進度",
                            text: error.message,
                            icon: "error"
                        });
                    }
                }

                return false;
            }

            restoringSession = true;

            quizQuestions = savedQuestions;
            userAnswers = new Array(
                quizQuestions.length
            ).fill(null);

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
            quizSubmitted = false;
            finishingQuiz = false;

            if ($("total")) {
                $("total").textContent = quizQuestions.length;
            }

            showScreen("quiz");
            renderQuestion();

            restoringSession = false;
            return true;
        } catch (error) {
            restoringSession = false;

            console.error(
                "恢復未完成測驗失敗：",
                error
            );

            await showAlert({
                title: "恢復測驗失敗",
                text: "讀取未完成測驗失敗，請稍後再試。",
                icon: "error"
            });

            return false;
        }
    }

    function createImage(src, alt, className) {
        if (typeof src !== "string" || !src.trim()) {
            return null;
        }

        const img = document.createElement("img");

        img.src = new URL(
            src.trim(),
            document.baseURI
        ).href;

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
                    "題庫載入失敗（HTTP " +
                    response.status +
                    "）。"
                );
            }

            const data = await response.json();

            const rawQuestions = Array.isArray(data)
                ? data
                : data.questions;

            if (!Array.isArray(rawQuestions)) {
                throw new Error(
                    "題庫格式錯誤，找不到題目陣列。"
                );
            }

            questionBank = rawQuestions
                .map((question, index) => {
                    const options = question.options || {};

                    return {
                        ...question,
                        id: String(
                            question.id || "exam-" + (index + 1)
                        ),
                        question: String(
                            question.question || ""
                        ).trim(),
                        image: question.image || "",
                        options,
                        optionImages: question.optionImages || {},
                        answer: String(
                            question.answer || ""
                        ).trim().toUpperCase(),
                        explanation:
                            typeof question.explanation === "string"
                                ? question.explanation
                                : ""
                    };
                })
                .filter((question) =>
                    question.question &&
                    LETTERS.every(
                        (letter) =>
                            question.options[letter] !== undefined
                    ) &&
                    LETTERS.includes(question.answer)
                );

            if (!questionBank.length) {
                throw new Error(
                    "沒有格式正確的選擇題。"
                );
            }

            if ($("bankCount")) {
                $("bankCount").textContent =
                    questionBank.length;
            }

            await restoreSavedSession();
        } catch (error) {
            if ($("bankCount")) {
                $("bankCount").textContent = "載入失敗";
            }

            console.error(
                "專一題庫載入失敗：",
                error
            );

            await showAlert({
                title: "題庫載入失敗",
                text:
                    "請確認 major1.json 是否存在且格式正確。",
                icon: "error"
            });
        }
    }

    async function startQuiz() {
        if (!questionBank.length) {
            await showAlert({
                title: "目前沒有可作答的題目",
                text: "請確認題庫是否已載入完成。",
                icon: "warning"
            });

            return;
        }

        if (finishingQuiz) return;

        if (
            quizQuestions.length &&
            $("quiz")?.classList.contains("active") &&
            !quizSubmitted
        ) {
            const shouldRestart = await confirmAction({
                title: "確定要重新開始？",
                text: "目前作答內容將被取代。",
                confirmText: "重新開始",
                cancelText: "繼續作答",
                icon: "warning"
            });

            if (!shouldRestart) return;
        }

        await sessionSaveQueue;

        quizQuestions = questionBank.slice(
            0,
            Math.min(
                QUESTIONS_PER_QUIZ,
                questionBank.length
            )
        );

        userAnswers = new Array(
            quizQuestions.length
        ).fill(null);

        currentIndex = 0;
        quizStartedAt = Date.now();
        quizSubmitted = false;
        finishingQuiz = false;

        if ($("total")) {
            $("total").textContent = quizQuestions.length;
        }

        showScreen("quiz");
        renderQuestion();

        await saveSession();
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
            content.textContent =
                question.options[letter] || "";

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
                saveSession();
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

    async function saveCompletedQuiz(correct, total) {
        const user = await getCurrentUser();
        const studyData = getStudyData();

        if (!user) {
            await showAlert({
                title: "測驗完成！",
                text: "本次成績已完成計算，但目前尚未登入，無法同步至雲端。",
                icon: "info"
            });

            return;
        }

        if (!studyData) {
            await showAlert({
                title: "雲端同步尚未完成",
                text: "測驗已完成，但雲端資料模組尚未載入。",
                icon: "warning"
            });

            return;
        }

        const answerMap = makeAnswerMap();

        const duration = quizStartedAt
            ? Math.max(
                0,
                Math.floor(
                    (Date.now() - quizStartedAt) / 1000
                )
            )
            : 0;

        const wrongQuestions = quizQuestions.filter(
            (question, index) =>
                userAnswers[index] !== question.answer
        );

        let attemptSaved = false;
        let wrongSaved = false;

        const errors = [];

        try {
            if (typeof studyData.saveAttempt !== "function") {
                throw new Error("找不到成績儲存功能。");
            }

            const result = await studyData.saveAttempt({
                subject: SUBJECT,
                quiz_name: QUIZ_NAME,
                total_questions: total,
                correct_count: correct,
                score: correct * POINTS_PER_QUESTION,
                answers: answerMap,
                duration_seconds: duration
            });

            if (
                result === false ||
                result?.error ||
                result?.saved === false
            ) {
                throw result?.error ||
                    new Error("成績儲存未成功。");
            }

            attemptSaved = true;
        } catch (error) {
            console.error("成績同步失敗：", error);
            errors.push("成績");
        }

        try {
            if (
                typeof studyData.saveWrongQuestions !== "function"
            ) {
                throw new Error("找不到錯題儲存功能。");
            }

            const result = await studyData.saveWrongQuestions(
                SUBJECT,
                wrongQuestions,
                answerMap
            );

            if (
                result === false ||
                result?.error ||
                result?.saved === false
            ) {
                throw result?.error ||
                    new Error("錯題儲存未成功。");
            }

            wrongSaved = true;
        } catch (error) {
            console.error("錯題同步失敗：", error);
            errors.push("錯題");
        }

        if (!attemptSaved || !wrongSaved) {
            await showAlert({
                title: "雲端同步未完成",
                text:
                    "本次測驗已完成批改，但以下資料未能確認儲存：" +
                    errors.join("、") +
                    "。請檢查網路連線與 Supabase 設定。",
                icon: "error"
            });

            return;
        }

        let sessionDeleted = false;
        let deleteError = null;

        try {
            await deleteSession();
            sessionDeleted = true;
        } catch (error) {
            deleteError = error;

            console.error(
                "清除未完成測驗紀錄失敗：",
                error
            );
        }

        if (sessionDeleted) {
            await showAlert({
                title: "測驗成績已儲存！",
                text: "本次成績與錯題已同步至雲端，未完成測驗紀錄也已清除。",
                icon: "success"
            });
        } else {
            await showAlert({
                title: "成績已儲存，但進度未清除",
                text:
                    "本次成績與錯題已成功儲存至雲端，但未完成測驗紀錄尚未確認刪除。" +
                    (deleteError?.message
                        ? "\n\n原因：" + deleteError.message
                        : ""),
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
                ? "尚有 " + unanswered +
                  " 題未作答，交卷後將計為答錯。確定交卷嗎？"
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
            
            await sessionSaveQueue;

            
            quizSubmitted = true;

            let correct = 0;

            quizQuestions.forEach((question, index) => {
                if (userAnswers[index] === question.answer) {
                    correct++;
                }
            });

            const total = quizQuestions.length;
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
                    (
                        total
                            ? Math.round(correct / total * 100)
                            : 0
                    ) + "%";
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

                    const questionText =
                        document.createElement("div");

                    questionText.style.fontWeight = "bold";
                    questionText.style.margin = "8px 0";
                    questionText.style.whiteSpace = "pre-line";
                    questionText.textContent = question.question;

                    item.appendChild(questionText);

                    if (question.image && question.image.trim()) {
                        const image = createImage(
                            question.image,
                            "專一題目圖片",
                            "question-image"
                        );

                        if (image) item.appendChild(image);
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

                        if (letter === answer) {
                            const mark =
                                document.createElement("strong");

                            mark.textContent = " ✓ 正確答案";
                            mark.style.color = "#dc2626";

                            p.appendChild(mark);
                        }

                        options.appendChild(p);
                    });

                    item.appendChild(options);

                    const explanation =
                        document.createElement("div");

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

            
            await saveCompletedQuiz(correct, total);
        } catch (error) {
            console.error("交卷處理失敗：", error);

            await showAlert({
                title: "交卷處理發生錯誤",
                text: "測驗結果處理時發生問題。",
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
        }

        if (action === "home") {
            if (finishingQuiz) return;

            showScreen("home");
        }

        if (action === "quit") {
            if (finishingQuiz || quizSubmitted) return;

            const shouldQuit = await confirmAction({
                title: "確定要退出測驗嗎？",
                text: "登入後會嘗試保留目前作答進度，下次可繼續作答。",
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
                await saveSession();
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
                await saveSession();
            } else {
                await finishQuiz();
            }
        });
    }

    loadBank();
})();
