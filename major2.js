(() => {
    "use strict";

    const BANK_URL = "major2.json";
    const QUESTIONS_PER_QUIZ = 50;
    const POINTS_PER_QUESTION = 2;
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

        if (className === "option-image" || className === "review-option-image") {
            img.style.maxWidth = "min(100%, 320px)";
            img.style.maxHeight = "180px";
        } else {
            img.style.maxHeight = "240px";
        }

        img.onerror = () => {
            img.remove();
        };

        return img;
    }

    function renderQuestionContent(container, question, review = false) {
        container.innerHTML = "";

        // 1. 先顯示題目文字
        const prompt = document.createElement("div");
        prompt.className = review ? "review-question-text" : "";
        prompt.style.fontWeight = "bold";
        prompt.style.marginBottom = "10px";
        prompt.style.whiteSpace = "pre-line"; // 保持換行格式
        prompt.textContent = question.question || "";
        container.appendChild(prompt);

        // 2. 如果有圖片，則在文字下方加上圖片
        const image = createImage(
            question.image,
            "題目圖片",
            review ? "review-question-image" : "question-image"
        );

        if (image) {
            container.appendChild(image);
        }
    }

    async function loadBank() {
        const startButton = $("startBtn");
        if (startButton) startButton.disabled = true;

        try {
            const response = await fetch(BANK_URL, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error("題庫載入失敗（HTTP " + response.status + "）。");
            }

            const data = await response.json();
            const rawQuestions = Array.isArray(data) ? data : data.questions;

            if (!Array.isArray(rawQuestions)) {
                throw new Error("題庫格式錯誤，找不到題目陣列。");
            }

            questionBank = rawQuestions.map((question, index) => {
                const options = question.options || {};

                return {
                    id: question.id || "exam-" + (index + 1),
                    question: String(question.question || "").trim(),
                    image: question.image || "",
                    options,
                    optionImages: question.optionImages || {},
                    answer: String(question.answer || "").trim().toUpperCase(),
                    explanation: typeof question.explanation === "string"
                        ? question.explanation
                        : ""
                };
            }).filter((question) =>
                question.question &&
                LETTERS.every((letter) => question.options[letter] !== undefined)
            );

            if (!questionBank.length) {
                throw new Error("沒有格式正確的選擇題。");
            }

            $("bankCount").textContent = questionBank.length;
            if (startButton) startButton.disabled = false;

            if ($("loadError")) {
                $("loadError").hidden = true;
                $("loadError").textContent = "";
            }
        } catch (error) {
            $("bankCount").textContent = "載入失敗";

            if ($("loadError")) {
                $("loadError").hidden = false;
                $("loadError").textContent =
                    error.message + " 請確認 HTML、JS、JSON 與圖片資料夾都已上傳。";
            }

            console.error(error);
        }
    }

    function startQuiz() {
        if (!questionBank.length) {
            alert("目前沒有可作答的題目。");
            return;
        }

        quizQuestions = questionBank.slice(
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
            const answer = String(question.answer || "").trim().toUpperCase();

            if (userAnswers[index] === answer) {
                correct++;
            }
        });

        const wrong = total - correct;

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
            const answer = String(question.answer || "").trim().toUpperCase();

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

                if (image) {
                    p.appendChild(image);
                }

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

        showScreen("result");
    }

    if ($("startBtn")) {
        $("startBtn").addEventListener("click", startQuiz);
    }

    $("prevBtn").addEventListener("click", () => {
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion();
        }
    });

    $("nextBtn").addEventListener("click", () => {
        if (!quizQuestions.length) return;

        if (!userAnswers[currentIndex]) {
            alert("請先選擇答案。");
            return;
        }

        if (currentIndex < quizQuestions.length - 1) {
            currentIndex++;
            renderQuestion();
        } else {
            finishQuiz();
        }
    });

    if ($("quitBtn")) {
        $("quitBtn").addEventListener("click", () => {
            if (confirm("確定要退出測驗嗎？目前作答進度將會結束。")) {
                showScreen("home");
            }
        });
    }

    if ($("homeBtn")) {
        $("homeBtn").addEventListener("click", () => showScreen("home"));
    }
    if ($("againBtn")) {
        $("againBtn").addEventListener("click", startQuiz);
    }

    loadBank();
})();
