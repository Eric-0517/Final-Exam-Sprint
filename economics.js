(() => {
    "use strict";

    const BANK_URL = "economics-questions.json";
    const QUESTIONS_PER_QUIZ = 40;
    const POINTS_PER_QUESTION = 2.5;
    const LETTERS = ["A", "B", "C", "D"];

    const SUBJECT = "經濟學";
    const SESSION_SUBJECT = "economics";
    const QUIZ_NAME = "經濟學(第1次模擬考)啟芳";

    const $ = id => document.getElementById(id);
    const screens = ["home", "quiz", "result"];

    let questionBank = [];
    let quizQuestions = [];
    let userAnswers = [];
    let currentIndex = 0;
    let startedAt = 0;
    let savingSession = Promise.resolve();
    let submitting = false;
    let finishingQuiz = false;

    function showScreen(id) {
        screens.forEach(screenId => {
            $(screenId).classList.toggle("active", screenId === id);
        });
        window.scrollTo(0, 0);
    }

    function showAlert(options) {
        if (window.Swal) {
            return Swal.fire({
                confirmButtonColor: "#3156d3",
                ...options
            });
        }

        if (options.showCancelButton) {
            return Promise.resolve({
                isConfirmed: window.confirm(options.text || options.title || "")
            });
        }

        window.alert(
            [options.title, options.text].filter(Boolean).join("\n\n")
        );

        return Promise.resolve({ isConfirmed: true });
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function createImage(src, alt, className) {
        if (!src) return null;

        const img = document.createElement("img");
        img.src = new URL(src, document.baseURI).href;
        img.alt = alt;
        img.className = className;
        img.loading = "eager";

        img.onerror = () => {
            console.error("圖片載入失敗：", img.src);
            img.style.display = "none";
        };

        return img;
    }

    function renderQuestionContent(container, question, review = false) {
        container.innerHTML = "";

        const image = createImage(
            question.image,
            "題目圖片",
            "reading-image"
        );

        if (image) container.appendChild(image);

        const prompt = document.createElement("div");
        prompt.className = review ? "review-question-text" : "";
        prompt.textContent = question.question || "";
        container.appendChild(prompt);
    }

    function getAnswerMap() {
        const answers = {};

        quizQuestions.forEach((question, index) => {
            if (userAnswers[index] !== null) {
                answers[question.id] = userAnswers[index];
            }
        });

        return answers;
    }

    function isSignedIn() {
        return Boolean(window.sb && window.StudyData);
    }

    async function saveCurrentSession() {
        if (
            !isSignedIn() ||
            !quizQuestions.length ||
            finishingQuiz
        ) {
            return;
        }

        const payload = {
            subject: SESSION_SUBJECT,
            quiz_name: QUIZ_NAME,
            question_ids: quizQuestions.map(question => question.id),
            answers: getAnswerMap(),
            current_index: currentIndex
        };

        savingSession = savingSession
            .catch(() => {})
            .then(async () => {
                if (finishingQuiz) return;

                const result = await window.StudyData.saveSession(payload);

                if (!result.saved && result.reason !== "not_signed_in") {
                    throw new Error("測驗進度儲存失敗。");
                }

                return result;
            })
            .catch(error => {
                console.error("儲存測驗進度失敗：", error);
            });

        return savingSession;
    }

    async function deleteSavedSession() {
        if (!isSignedIn()) return false;

        try {
            const result = await window.StudyData.deleteSession(
                SESSION_SUBJECT
            );

            return result === true;
        } catch (error) {
            console.error("清除已完成測驗進度失敗：", error);
            return false;
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
                    id: String(question.id || "economics-" + (index + 1)),
                    question: String(question.question || ""),
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
            }).filter(question =>
                question.question &&
                LETTERS.every(letter =>
                    question.options[letter] !== undefined
                ) &&
                LETTERS.includes(question.answer)
            );

            if (!questionBank.length) {
                throw new Error(
                    "沒有格式正確且具有標準答案的選擇題。"
                );
            }

            $("bankCount").textContent = questionBank.length;
            startButton.disabled = false;

            if (questionBank.length < QUESTIONS_PER_QUIZ) {
                console.warn(
                    "題庫只有 " + questionBank.length +
                    " 題，將依實際題數開始測驗。"
                );
            }
        } catch (error) {
            $("bankCount").textContent = "載入失敗";

            if ($("loadError")) {
                $("loadError").hidden = false;
                $("loadError").textContent =
                    error.message +
                    " 請確認 HTML、JS、JSON 與 economics-assets 資料夾都已上傳。";
            }

            console.error(error);

            await showAlert({
                icon: "error",
                title: "題庫載入失敗",
                text: error.message
            });
        }
    }

    function initializeQuiz(questions, answers = {}, index = 0) {
        quizQuestions = questions;

        userAnswers = quizQuestions.map(question => {
            const answer = answers[question.id];
            return LETTERS.includes(answer) ? answer : null;
        });

        currentIndex = Math.max(
            0,
            Math.min(index, quizQuestions.length - 1)
        );

        startedAt = Date.now();
        submitting = false;
        finishingQuiz = false;

        $("total").textContent = quizQuestions.length;
        showScreen("quiz");
        renderQuestion();
    }

    async function startQuiz() {
        if (!questionBank.length) {
            await showAlert({
                icon: "warning",
                title: "目前沒有可作答的題目",
                text: "請確認題庫已成功載入。"
            });
            return;
        }

        let savedSession = null;

        if (isSignedIn()) {
            try {
                const user = await window.StudyData.currentUser();

                if (user) {
                    savedSession = await window.StudyData.getSession(
                        SESSION_SUBJECT
                    );
                }
            } catch (error) {
                console.error("讀取未完成測驗失敗：", error);
            }
        }

        if (
            savedSession &&
            Array.isArray(savedSession.question_ids) &&
            savedSession.question_ids.length
        ) {
            const choice = await showAlert({
                icon: "question",
                title: "發現未完成的測驗",
                text: "是否繼續上次的測驗進度？",
                showCancelButton: true,
                confirmButtonText: "繼續測驗",
                cancelButtonText: "重新開始",
                reverseButtons: true
            });

            if (choice.isConfirmed) {
                const bankMap = new Map(
                    questionBank.map(question => [question.id, question])
                );

                const restoredQuestions = savedSession.question_ids
                    .map(id => bankMap.get(String(id)))
                    .filter(Boolean);

                if (
                    restoredQuestions.length ===
                    savedSession.question_ids.length
                ) {
                    initializeQuiz(
                        restoredQuestions,
                        savedSession.answers || {},
                        Number(savedSession.current_index || 0)
                    );

                    return;
                }

                await showAlert({
                    icon: "warning",
                    title: "無法恢復測驗",
                    text: "原本的題庫內容已變更，將開始新的測驗。"
                });
            }
        }

        initializeQuiz(
            questionBank.slice(
                0,
                Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
            )
        );

        await saveCurrentSession();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];

        $("qNo").textContent = currentIndex + 1;
        $("total").textContent = quizQuestions.length;

        $("progressBar").style.width =
            ((currentIndex + 1) / quizQuestions.length * 100) + "%";

        renderQuestionContent($("questionText"), question);

        const optionsBox = $("options");
        optionsBox.innerHTML = "";

        LETTERS.forEach(letter => {
            const selected = userAnswers[currentIndex] === letter;
            const button = document.createElement("button");

            button.type = "button";
            button.className = "option" + (selected ? " selected" : "");
            button.setAttribute("aria-pressed", selected ? "true" : "false");

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
                if (submitting || finishingQuiz) return;

                userAnswers[currentIndex] = letter;
                renderQuestion();
                void saveCurrentSession();
            });

            optionsBox.appendChild(button);
        });

        $("prevBtn").disabled = currentIndex === 0;

        $("nextBtn").textContent =
            currentIndex === quizQuestions.length - 1
                ? "交卷並看結果"
                : "下一題";
    }

    async function finishQuiz() {
        if (submitting || finishingQuiz) return;

        finishingQuiz = true;
        submitting = true;

        const total = quizQuestions.length;
        let correct = 0;

        quizQuestions.forEach((question, index) => {
            if (userAnswers[index] === question.answer) correct++;
        });

        const wrong = total - correct;
        const score = correct * POINTS_PER_QUESTION;
        const answerMap = getAnswerMap();

        $("score").textContent = score;
        $("correctCount").textContent = correct;
        $("wrongCount").textContent = wrong;

        $("accuracy").textContent =
            (total ? Math.round(correct / total * 100) : 0) + "%";

        $("wrongSummary").textContent = "共 " + wrong + " 題錯題";

        const wrongList = $("wrongList");
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

            const questionContent = document.createElement("div");
            questionContent.className = "review-question";

            renderQuestionContent(questionContent, question, true);
            item.appendChild(questionContent);

            const options = document.createElement("div");
            options.className = "review-options";

            LETTERS.forEach(letter => {
                const p = document.createElement("p");
                const key = document.createElement("strong");

                key.textContent = letter + ". ";
                p.appendChild(key);
                p.appendChild(
                    document.createTextNode(question.options[letter] || "")
                );

                if (question.optionImages[letter]) {
                    const image = createImage(
                        question.optionImages[letter],
                        letter + " 選項圖片",
                        "review-option-image"
                    );

                    if (image) p.appendChild(image);
                }

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
                question.explanation.trim() || "請重新閱讀題幹與選項。";

            item.appendChild(explanation);
            wrongList.appendChild(item);
        });

        if (wrong === 0) {
            wrongList.innerHTML =
                '<div class="notice">全部答對，沒有錯題！</div>';
        }

        showScreen("result");

        let savedSuccessfully = false;
        let sessionDeleted = false;

        try {
            await savingSession;

            if (isSignedIn()) {
                const user = await window.StudyData.currentUser();

                if (user) {
                    const answersForStorage = Object.fromEntries(
                        quizQuestions.map((question, index) => [
                            question.id,
                            userAnswers[index]
                        ])
                    );

                    const record = {
                        subject: SUBJECT,
                        quiz_name: QUIZ_NAME,
                        total_questions: total,
                        correct_count: correct,
                        score,
                        answers: answersForStorage,
                        duration_seconds: Math.max(
                            0,
                            Math.floor((Date.now() - startedAt) / 1000)
                        )
                    };

                    const attemptResult =
                        await window.StudyData.saveAttempt(record);

                    const wrongResult =
                        await window.StudyData.saveWrongQuestions(
                            SUBJECT,
                            quizQuestions,
                            answerMap
                        );

                    savedSuccessfully = Boolean(
                        attemptResult &&
                        attemptResult.saved &&
                        wrongResult &&
                        wrongResult.saved
                    );

                    sessionDeleted = await deleteSavedSession();
                }
            }

            submitting = false;

            if (savedSuccessfully) {
                await showAlert({
                    icon: "success",
                    title: "測驗完成！",
                    html:
                        "本次得分：<strong>" + escapeHTML(score) +
                        " 分</strong><br>" +
                        "答對 " + correct + " 題，答錯 " + wrong + " 題。" +
                        "<br><br>" +
                        (sessionDeleted
                            ? "成績、錯題已儲存，未完成測驗進度已清除。"
                            : "成績與錯題已儲存，但未完成測驗進度未能確認清除。"),
                    confirmButtonText: "查看錯題與詳解"
                });
            } else if (isSignedIn()) {
                await showAlert({
                    icon: "warning",
                    title: "測驗已完成",
                    html:
                        "本次得分：<strong>" + escapeHTML(score) +
                        " 分</strong><br>" +
                        "答對 " + correct + " 題，答錯 " + wrong + " 題。" +
                        "<br><br>雲端成績或錯題儲存未完全成功，請檢查網路及 Supabase 設定。",
                    confirmButtonText: "查看錯題與詳解"
                });
            } else {
                await showAlert({
                    icon: "success",
                    title: "測驗完成！",
                    html:
                        "本次得分：<strong>" + escapeHTML(score) +
                        " 分</strong><br>" +
                        "答對 " + correct + " 題，答錯 " + wrong + " 題。" +
                        "<br><br>登入後才能將成績與錯題同步至雲端。",
                    confirmButtonText: "查看錯題與詳解"
                });
            }
        } catch (error) {
            console.error("雲端測驗資料儲存失敗：", error);
            submitting = false;

            await showAlert({
                icon: "error",
                title: "雲端儲存失敗",
                html:
                    "本次測驗已完成，分數仍會顯示。<br>" +
                    "請檢查網路及 Supabase 設定後再確認雲端資料。",
                confirmButtonText: "查看錯題與詳解"
            });
        }
    }

    $("startBtn").addEventListener("click", startQuiz);

    $("prevBtn").addEventListener("click", () => {
        if (currentIndex > 0 && !submitting && !finishingQuiz) {
            currentIndex--;
            renderQuestion();
            void saveCurrentSession();
        }
    });

    $("nextBtn").addEventListener("click", () => {
        if (!quizQuestions.length || submitting || finishingQuiz) return;

        if (currentIndex < quizQuestions.length - 1) {
            currentIndex++;
            renderQuestion();
            void saveCurrentSession();
        } else {
            void finishQuiz();
        }
    });

    $("quitBtn").addEventListener("click", async () => {
        if (submitting || finishingQuiz) return;

        const choice = await showAlert({
            icon: "question",
            title: "確定要退出測驗嗎？",
            text: "登入狀態下會保留目前進度。",
            showCancelButton: true,
            confirmButtonText: "退出測驗",
            cancelButtonText: "繼續作答",
            reverseButtons: true
        });

        if (choice.isConfirmed) {
            await saveCurrentSession();
            showScreen("home");
        }
    });

    $("homeBtn").addEventListener("click", () => {
        showScreen("home");
    });

    $("againBtn").addEventListener("click", startQuiz);

    loadBank();
})();
