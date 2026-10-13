(() => {
    "use strict";

    const BANK_URL = "economics-questions.json";
    const QUESTIONS_PER_QUIZ = 40;
    const POINTS_PER_QUESTION = 2.5;
    const LETTERS = ["A", "B", "C", "D"];

    const $ = (id) => document.getElementById(id);
    const screens = ["home", "quiz", "result"];

    let questionBank = [];
    let quizQuestions = [];
    let userAnswers = [];
    let currentIndex = 0;

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

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
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
                    id: question.id || "economics-" + (index + 1),
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
            }).filter((question) =>
                question.question &&
                LETTERS.every(
                    (letter) =>
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
        } catch (error) {
            $("bankCount").textContent = "載入失敗";

            if ($("loadError")) {
                $("loadError").hidden = false;
                $("loadError").textContent =
                    error.message +
                    " 請確認 HTML、JS、JSON 與 economics-assets 資料夾都已上傳。";
            }

            console.error(error);
        }
    }

    function startQuiz() {
        if (!questionBank.length) {
            alert("目前沒有可作答的題目。");
            return;
        }

        quizQuestions = shuffle(questionBank).slice(
            0,
            Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
        );

        userAnswers = new Array(quizQuestions.length).fill(null);
        currentIndex = 0;

        $("total").textContent = quizQuestions.length;

        showScreen("quiz");
        renderQuestion();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];

        $("qNo").textContent = currentIndex + 1;
        $("total").textContent = quizQuestions.length;

        $("progressBar").style.width =
            (
                (currentIndex + 1) /
                quizQuestions.length *
                100
            ) + "%";

        renderQuestionContent($("questionText"), question);

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
            content.textContent = question.options[letter] || "";

            const image = createImage(
                question.optionImages[letter],
                letter + " 選項圖片",
                "option-image"
            );

            button.appendChild(key);
            button.appendChild(content);

            if (image) {
                const wrapper = document.createElement("span");
                wrapper.className = "option-text";
                wrapper.appendChild(image);
                button.appendChild(wrapper);
            }

            button.addEventListener("click", () => {
                userAnswers[currentIndex] = letter;
                renderQuestion();
            });

            optionsBox.appendChild(button);
        });

        $("prevBtn").disabled = currentIndex === 0;

        $("nextBtn").textContent =
            currentIndex === quizQuestions.length - 1
                ? "交卷並看結果"
                : "下一題";
    }

    function finishQuiz() {
        const total = quizQuestions.length;
        let correct = 0;

        quizQuestions.forEach((question, index) => {
            if (userAnswers[index] === question.answer) {
                correct++;
            }
        });

        const wrong = total - correct;

        $("score").textContent = correct * POINTS_PER_QUESTION;
        $("correctCount").textContent = correct;
        $("wrongCount").textContent = wrong;

        $("accuracy").textContent =
            (
                total
                    ? Math.round(correct / total * 100)
                    : 0
            ) + "%";

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
                " 題｜你的答案：" +
                (selected || "未作答") +
                "｜正確答案：" +
                question.answer;

            item.appendChild(title);

            const questionContent = document.createElement("div");
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
                question.explanation.trim() ||
                "請重新閱讀題幹與選項。";

            item.appendChild(explanation);
            wrongList.appendChild(item);
        });

        if (wrong === 0) {
            wrongList.innerHTML =
                '<div class="notice">全部答對，沒有錯題！</div>';
        }

        showScreen("result");
    }

    $("startBtn").addEventListener("click", startQuiz);

    $("prevBtn").addEventListener("click", () => {
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion();
        }
    });

    $("nextBtn").addEventListener("click", () => {
        if (!quizQuestions.length) return;

        if (currentIndex < quizQuestions.length - 1) {
            currentIndex++;
            renderQuestion();
        } else {
            finishQuiz();
        }
    });

    $("quitBtn").addEventListener("click", () => {
        if (
            confirm(
                "確定要退出測驗嗎？目前作答進度將會結束。"
            )
        ) {
            showScreen("home");
        }
    });

    $("homeBtn").addEventListener("click", () => {
        showScreen("home");
    });

    $("againBtn").addEventListener("click", startQuiz);

    loadBank();
})();
