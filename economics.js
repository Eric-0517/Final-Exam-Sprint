(() => {
    "use strict";

    const BANK_URL = "economics-questions.json";
    const QUESTIONS_PER_QUIZ = 40;
    const POINTS_PER_QUESTION = 2.5;
    const LETTERS = ["A", "B", "C", "D"];

    const SUBJECT = "經濟學";
    const SESSION_SUBJECT = "economics";
    const QUIZ_NAME = "經濟學(第1次模擬考)啟芳";

    const SWAL_COLOR = "#2563eb";

    const $ = (id) => document.getElementById(id);
    const screens = ["home", "quiz", "result"];

    let questionBank = [];
    let quizQuestions = [];
    let userAnswers = [];
    let currentIndex = 0;
    let quizStartedAt = 0;
    let savingSession = Promise.resolve();
    let finishingQuiz = false;
    let quizCompleted = false;

    function swalBase() {
        return {
            confirmButtonColor: SWAL_COLOR,
            cancelButtonColor: "#64748b",
            reverseButtons: true,
            customClass: {
                popup: "study-swal-popup"
            }
        };
    }

    function showSuccess(title, text) {
        return Swal.fire({
            ...swalBase(),
            icon: "success",
            title,
            text,
            confirmButtonText: "確定",
            allowOutsideClick: false,
            allowEscapeKey: false
        });
    }

    function showError(title, text) {
        return Swal.fire({
            ...swalBase(),
            icon: "error",
            title,
            text,
            confirmButtonText: "確定"
        });
    }

    function showWarning(title, text) {
        return Swal.fire({
            ...swalBase(),
            icon: "warning",
            title,
            text,
            confirmButtonText: "確定"
        });
    }

    function showInfo(title, text) {
        return Swal.fire({
            ...swalBase(),
            icon: "info",
            title,
            text,
            confirmButtonText: "確定"
        });
    }

    async function confirmAction({
        title,
        text,
        confirmText = "確定",
        cancelText = "取消",
        icon = "question"
    }) {
        const result = await Swal.fire({
            ...swalBase(),
            icon,
            title,
            text,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            focusCancel: true
        });

        return result.isConfirmed;
    }

    function showScreen(id) {
        screens.forEach((screenId) => {
            const screen = $(screenId);

            if (screen) {
                screen.classList.toggle(
                    "active",
                    screenId === id
                );
            }
        });

        window.scrollTo(0, 0);
    }

    function getStudyData() {
        return window.StudyData || null;
    }

    async function isSignedIn() {
        try {
            if (!window.sb?.auth) {
                return false;
            }

            const { data, error } =
                await window.sb.auth.getSession();

            if (error) {
                console.error("讀取登入狀態失敗：", error);
                return false;
            }

            return Boolean(data?.session?.user);
        } catch (error) {
            console.error("讀取登入狀態失敗：", error);
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

    function renderQuestionContent(
        container,
        question,
        review = false
    ) {
        container.innerHTML = "";

        const image = createImage(
            question.image,
            "題目圖片",
            review
                ? "review-question-image"
                : "question-image"
        );

        if (image) {
            container.appendChild(image);
        }

        const prompt = document.createElement("div");

        prompt.className = review
            ? "review-question-text"
            : "";

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

        if (!startButton) {
            console.error(
                "找不到開始測驗按鈕 startBtn。"
            );
            return;
        }

        startButton.disabled = true;

        try {
            if (typeof Swal === "undefined") {
                throw new Error(
                    "SweetAlert2 尚未載入，請檢查 HTML 的 script 引用。"
                );
            }

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
                            question.id ||
                            "economics-" + (index + 1)
                        ),
                        question: String(
                            question.question || ""
                        ).trim(),
                        image: question.image || "",
                        options,
                        optionImages:
                            question.optionImages || {},
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
                    LETTERS.every((letter) =>
                        question.options[letter] !== undefined
                    ) &&
                    LETTERS.includes(question.answer)
                );

            if (!questionBank.length) {
                throw new Error(
                    "沒有格式正確的選擇題。"
                );
            }

            $("bankCount").textContent =
                questionBank.length;

            startButton.disabled = false;

            if ($("loadError")) {
                $("loadError").hidden = true;
                $("loadError").textContent = "";
            }
        } catch (error) {
            $("bankCount").textContent = "載入失敗";
            startButton.disabled = true;

            const message =
                (error.message || "未知錯誤") +
                " 請確認 HTML、JS、JSON 與 economics-assets 資料夾都已上傳。";

            showLoadError(message);

            console.error(
                "經濟學題庫載入失敗：",
                error
            );

            if (typeof Swal !== "undefined") {
                await showError(
                    "題庫載入失敗",
                    message
                );
            } else {
                window.alert(message);
            }
        }
    }

    function getAnswerMap() {
        const answers = {};

        quizQuestions.forEach((question, index) => {
            answers[question.id] =
                userAnswers[index] || null;
        });

        return answers;
    }

    function queueSaveSession() {
        if (finishingQuiz || quizCompleted) {
            return savingSession;
        }

        savingSession = savingSession
            .catch(() => {})
            .then(async () => {
                if (finishingQuiz || quizCompleted) {
                    return;
                }

                const studyData = getStudyData();

                if (
                    !studyData ||
                    typeof studyData.saveSession !== "function" ||
                    !quizQuestions.length ||
                    !(await isSignedIn())
                ) {
                    return;
                }

                if (finishingQuiz || quizCompleted) {
                    return;
                }

                const result = await studyData.saveSession({
                    subject: SESSION_SUBJECT,
                    quiz_name: QUIZ_NAME,
                    question_ids: quizQuestions.map(
                        (question) => question.id
                    ),
                    answers: getAnswerMap(),
                    current_index: currentIndex
                });

                if (result?.saved !== true) {
                    console.warn(
                        "經濟學測驗進度尚未確認同步：",
                        result
                    );
                }
            })
            .catch((error) => {
                console.error(
                    "儲存經濟學測驗進度失敗：",
                    error
                );
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
            return false;
        }

        try {
            const result = await studyData.deleteSession(
                SESSION_SUBJECT
            );

            if (result !== true) {
                console.error(
                    "刪除經濟學測驗進度未獲確認：",
                    result
                );

                return false;
            }

            return true;
        } catch (error) {
            console.error(
                "刪除經濟學測驗進度失敗：",
                error
            );

            return false;
        }
    }

    function normalizeSession(result) {
        if (!result) {
            return null;
        }

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

            const result = await studyData.getSession(
                SESSION_SUBJECT
            );

            const session = normalizeSession(result);

            if (
                !session ||
                !Array.isArray(session.question_ids) ||
                !session.question_ids.length
            ) {
                return false;
            }

            const savedQuestions =
                session.question_ids.map((id) =>
                    questionBank.find(
                        (question) =>
                            question.id === String(id)
                    )
                );

            if (
                savedQuestions.some((question) => !question) ||
                savedQuestions.length > QUESTIONS_PER_QUIZ
            ) {
                const deleted = await deleteSavedSession();

                await showWarning(
                    "無法恢復測驗",
                    deleted
                        ? "原本的題庫內容已變更，舊進度已清除，請重新開始測驗。"
                        : "原本的題庫內容已變更，但舊進度尚未確認清除。請重新開始測驗，並確認個人中心的未完成測驗紀錄。"
                );

                return false;
            }

            const savedAnswers = session.answers || {};

            const hasAnswers = savedQuestions.some(
                (question) =>
                    LETTERS.includes(
                        savedAnswers[question.id]
                    )
            );

            const shouldRestore = await confirmAction({
                title: "要繼續上次的測驗嗎？",
                text: hasAnswers
                    ? "偵測到尚未完成的測驗進度，是否恢復上次的測驗？"
                    : "已找到尚未完成的測驗紀錄，是否恢復上次的作答進度？",
                confirmText: "繼續測驗",
                cancelText: "重新開始"
            });

            if (!shouldRestore) {
                const deleted = await deleteSavedSession();

                if (!deleted) {
                    await showWarning(
                        "舊進度尚未清除",
                        "系統未能確認舊的未完成測驗紀錄已刪除，請檢查網路連線後再確認。"
                    );
                }

                return false;
            }

            quizQuestions = savedQuestions;

            userAnswers = quizQuestions.map((question) => {
                const answer = savedAnswers[question.id];

                return LETTERS.includes(answer)
                    ? answer
                    : null;
            });

            currentIndex = Math.max(
                0,
                Math.min(
                    Number(session.current_index) || 0,
                    quizQuestions.length - 1
                )
            );

            quizStartedAt = Date.now();
            finishingQuiz = false;
            quizCompleted = false;

            $("total").textContent =
                quizQuestions.length;

            showScreen("quiz");
            renderQuestion();

            return true;
        } catch (error) {
            console.error(
                "恢復經濟學測驗失敗：",
                error
            );

            await showError(
                "恢復測驗失敗",
                "無法讀取上次的測驗進度，請稍後再試。"
            );

            return false;
        }
    }

    async function startQuiz() {
        if (!questionBank.length) {
            await showWarning(
                "目前沒有可作答的題目",
                "請確認題庫是否已正確載入。"
            );

            return;
        }

        if (finishingQuiz) {
            return;
        }

        if (await restoreSavedSession()) {
            return;
        }

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
        finishingQuiz = false;
        quizCompleted = false;

        $("total").textContent =
            quizQuestions.length;

        showScreen("quiz");
        renderQuestion();

        await queueSaveSession();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];

        if (!question) {
            return;
        }

        $("qNo").textContent = currentIndex + 1;
        $("total").textContent = quizQuestions.length;

        $("progressBar").style.width =
            (
                (currentIndex + 1) /
                quizQuestions.length *
                100
            ) + "%";

        renderQuestionContent(
            $("questionText"),
            question
        );

        const optionsBox = $("options");
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
                question.optionImages[letter],
                letter + " 選項圖片",
                "option-image"
            );

            if (image) {
                const wrapper =
                    document.createElement("span");

                wrapper.className = "option-text";
                wrapper.appendChild(image);
                button.appendChild(wrapper);
            }

            button.addEventListener("click", () => {
                if (finishingQuiz || quizCompleted) {
                    return;
                }

                userAnswers[currentIndex] = letter;

                renderQuestion();
                queueSaveSession();
            });

            optionsBox.appendChild(button);
        });

        $("prevBtn").disabled =
            currentIndex === 0 || finishingQuiz;

        $("nextBtn").disabled = finishingQuiz;

        $("nextBtn").textContent =
            currentIndex === quizQuestions.length - 1
                ? "交卷並看結果"
                : "下一題";
    }

    function renderResults(correct, wrong) {
        const total = quizQuestions.length;
        const score = correct * POINTS_PER_QUESTION;

        $("score").textContent = score
            .toFixed(1)
            .replace(/\.0$/, "");

        if ($("scoreLabel")) {
            $("scoreLabel").textContent =
                "分（滿分 100 分）";
        }

        $("correctCount").textContent = correct;
        $("wrongCount").textContent = wrong;

        $("accuracy").textContent =
            (
                total
                    ? Math.round(correct / total * 100)
                    : 0
            ) + "%";

        if ($("gradingNotice")) {
            $("gradingNotice").textContent =
                "已完成自動批改，共 " +
                total +
                " 題，每題 " +
                POINTS_PER_QUESTION +
                " 分，未作答的題目計為答錯。";
        }

        $("wrongSummary").textContent =
            "共 " + wrong + " 題錯題";

        const wrongList = $("wrongList");
        wrongList.innerHTML = "";

        quizQuestions.forEach((question, index) => {
            const selected = userAnswers[index];
            const answer = question.answer;

            if (selected === answer) {
                return;
            }

            const item = document.createElement("article");
            item.className = "wrong-item";

            const title = document.createElement("div");
            title.className = "wrong-question";

            title.textContent =
                "第 " +
                (index + 1) +
                " 題｜你的答案：" +
                (selected || "未作答") +
                "｜正確答案：" +
                answer;

            item.appendChild(title);

            const questionContent =
                document.createElement("div");

            questionContent.className = "review-question";

            renderQuestionContent(
                questionContent,
                question,
                true
            );

            item.appendChild(questionContent);

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
                    question.optionImages[letter],
                    letter + " 選項圖片",
                    "review-option-image"
                );

                if (image) {
                    p.appendChild(image);
                }

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
                question.explanation.trim() ||
                "請重新閱讀題幹與選項。";

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

    function isSaveSuccessful(result) {
        return Boolean(
            result &&
            typeof result === "object" &&
            result.saved === true
        );
    }

    async function saveCompletedQuiz(
        correct,
        wrong,
        sessionDeleted = false
    ) {
        const studyData = getStudyData();

        if (!studyData) {
            await showWarning(
                "雲端功能尚未準備完成",
                "本次測驗已完成批改，但雲端成績與錯題尚未確認儲存。"
            );

            return;
        }

        if (!(await isSignedIn())) {
            await showInfo(
                "測驗完成！",
                "本次成績已完成計算。登入後即可同步成績與錯題。"
            );

            return;
        }

        const total = quizQuestions.length;
        const score = correct * POINTS_PER_QUESTION;

        const durationSeconds = quizStartedAt
            ? Math.max(
                0,
                Math.round(
                    (Date.now() - quizStartedAt) / 1000
                )
            )
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

        let attemptSaved = false;
        let wrongQuestionsSaved = false;

        if (typeof studyData.saveAttempt === "function") {
            try {
                const result =
                    await studyData.saveAttempt(attempt);

                attemptSaved = isSaveSuccessful(result);

                if (!attemptSaved) {
                    errors.push("成績尚未確認儲存");

                    console.error(
                        "經濟學成績儲存結果：",
                        result
                    );
                }
            } catch (error) {
                errors.push("成績儲存失敗");

                console.error(
                    "儲存經濟學成績失敗：",
                    error
                );
            }
        } else {
            errors.push("找不到成績儲存功能");
        }

        if (
            typeof studyData.saveWrongQuestions === "function"
        ) {
            try {
                const result =
                    await studyData.saveWrongQuestions(
                        SUBJECT,
                        quizQuestions,
                        answerMap
                    );

                wrongQuestionsSaved =
                    isSaveSuccessful(result);

                if (!wrongQuestionsSaved) {
                    errors.push("錯題尚未確認儲存");

                    console.error(
                        "經濟學錯題儲存結果：",
                        result
                    );
                }
            } catch (error) {
                errors.push("錯題儲存失敗");

                console.error(
                    "儲存經濟學錯題失敗：",
                    error
                );
            }
        } else {
            errors.push("找不到錯題儲存功能");
        }

        if (attemptSaved && wrongQuestionsSaved) {
            await showSuccess(
                "測驗成績已儲存！",
                sessionDeleted
                    ? "本次成績與錯題已成功同步至雲端，未完成測驗紀錄也已清除。"
                    : "本次成績與錯題已成功同步至雲端，但未完成測驗紀錄尚未確認清除。請重新整理個人中心確認。"
            );

            return;
        }

        console.error(
            "經濟學雲端儲存結果：",
            errors
        );

        await showError(
            "雲端同步未完成",
            "本次測驗已完成批改，但部分資料尚未確認儲存：" +
            errors.join("、") +
            "。請檢查網路連線與 Supabase 設定。"
        );
    }

    async function finishQuiz() {
        if (finishingQuiz || quizCompleted || !quizQuestions.length) {
            return;
        }

        const unanswered = userAnswers.filter(
            (answer) => !answer
        ).length;

        const shouldSubmit = await confirmAction({
            title: unanswered > 0
                ? "還有題目未作答"
                : "確定要交卷？",
            text: unanswered > 0
                ? "目前還有 " +
                  unanswered +
                  " 題未作答，未作答的題目將計為答錯。確定要現在交卷嗎？"
                : "交卷後將顯示本次測驗成績與錯題解析。",
            confirmText: "確定交卷",
            cancelText: "繼續作答",
            icon: unanswered > 0
                ? "warning"
                : "question"
        });

        if (
            !shouldSubmit ||
            finishingQuiz ||
            quizCompleted
        ) {
            return;
        }

        finishingQuiz = true;

        if ($("nextBtn")) {
            $("nextBtn").disabled = true;
        }

        if ($("prevBtn")) {
            $("prevBtn").disabled = true;
        }

        if ($("quitBtn")) {
            $("quitBtn").disabled = true;
        }

        if ($("startBtn")) {
            $("startBtn").disabled = true;
        }

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

            // 先等待交卷前已排隊的自動儲存完成
            await savingSession;

            // 清除雲端未完成測驗紀錄
            let sessionDeleted = false;

            if (await isSignedIn()) {
                sessionDeleted = await deleteSavedSession();

                if (!sessionDeleted) {
                    console.warn(
                        "經濟學未完成測驗紀錄尚未確認刪除。"
                    );
                }
            }

            // 標記測驗已完成，避免再次儲存未完成進度
            quizCompleted = true;

            // 儲存本次成績與錯題
            await saveCompletedQuiz(
                correct,
                wrong,
                sessionDeleted
            );
        } catch (error) {
            console.error(
                "完成經濟學測驗失敗：",
                error
            );

            await showError(
                "發生錯誤",
                "測驗結果處理時發生問題，請稍後再試。"
            );
        } finally {
            finishingQuiz = false;

            if ($("nextBtn")) {
                $("nextBtn").disabled = false;
            }

            if ($("prevBtn")) {
                $("prevBtn").disabled = currentIndex === 0;
            }

            if ($("quitBtn")) {
                $("quitBtn").disabled = false;
            }

            if ($("startBtn")) {
                $("startBtn").disabled = false;
            }
        }
    }

    $("startBtn").addEventListener("click", startQuiz);

    $("prevBtn").addEventListener("click", () => {
        if (finishingQuiz || quizCompleted) {
            return;
        }

        if (currentIndex > 0) {
            currentIndex--;

            renderQuestion();
            queueSaveSession();
        }
    });

    $("nextBtn").addEventListener("click", () => {
        if (
            !quizQuestions.length ||
            finishingQuiz ||
            quizCompleted
        ) {
            return;
        }

        if (currentIndex < quizQuestions.length - 1) {
            currentIndex++;

            renderQuestion();
            queueSaveSession();
        } else {
            finishQuiz();
        }
    });

    $("quitBtn").addEventListener("click", async () => {
        if (finishingQuiz || quizCompleted) {
            return;
        }

        const shouldQuit = await confirmAction({
            title: "確定要離開測驗？",
            text: "已登入的帳號會嘗試保留目前作答進度，下次可選擇恢復。",
            confirmText: "確定離開",
            cancelText: "繼續作答"
        });

        if (!shouldQuit || finishingQuiz || quizCompleted) {
            return;
        }

        await queueSaveSession();
        showScreen("home");
    });

    $("homeBtn").addEventListener("click", async () => {
        if (finishingQuiz) {
            return;
        }

        const shouldReturn = await confirmAction({
            title: "確定要回首頁？",
            text: "本次測驗結果仍會保留在目前頁面，離開後將無法直接查看。",
            confirmText: "回首頁",
            cancelText: "取消"
        });

        if (shouldReturn) {
            showScreen("home");
        }
    });

    $("againBtn").addEventListener("click", async () => {
        if (finishingQuiz) {
            return;
        }

        const shouldRestart = await confirmAction({
            title: "確定要重新測驗？",
            text: "將重新開始測驗，並依照題庫原始順序出題。",
            confirmText: "重新測驗",
            cancelText: "取消"
        });

        if (!shouldRestart) {
            return;
        }

        await savingSession;

        const deleted = await deleteSavedSession();

        if (!deleted && await isSignedIn()) {
            await showWarning(
                "未完成紀錄尚未確認清除",
                "系統未能確認舊進度已刪除，將開始新測驗。若個人中心仍顯示舊紀錄，請重新整理並檢查雲端資料。"
            );
        }

        quizCompleted = false;
        finishingQuiz = false;

        await startQuiz();
    });

    loadBank();
})();
