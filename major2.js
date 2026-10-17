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
        if (!container) return;
        container.innerHTML = "";

       
        const prompt = document.createElement("div");
        prompt.className = review ? "review-question-text" : "";
        prompt.style.fontWeight = "bold";
        prompt.style.marginBottom = "10px";
        prompt.style.whiteSpace = "pre-line";
        prompt.textContent = question.question || "";
        container.appendChild(prompt);

        
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

            if ($("bankCount")) {
                $("bankCount").textContent = questionBank.length;
            }
        } catch (error) {
            if ($("bankCount")) {
                $("bankCount").textContent = "載入失敗";
            }
            console.error(error);
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

        showScreen("quiz");
        renderQuestion();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];
        if (!question) return;

        if ($("qNo")) {
            $("qNo").textContent = currentIndex + 1;
        }

       
        const progressTextEl = document.querySelector(".progress-text");
        if (progressTextEl) {
            progressTextEl.innerHTML = `<span id="qNo">${currentIndex + 1}</span> / ${quizQuestions.length}`;
        }

        if ($("progressBar")) {
            $("progressBar").style.width =
                ((currentIndex + 1) / quizQuestions.length * 100) + "%";
        }

        renderQuestionContent($("questionText") || document.querySelector(".question-card"), question);

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

        if ($("score")) {
            $("score").textContent = (correct * POINTS_PER_QUESTION)
                .toFixed(1)
                .replace(/\.0$/, "");
        }

        if ($("correctCount")) $("correctCount").textContent = correct;
        if ($("wrongCount")) $("wrongCount").textContent = wrong;
        if ($("accuracy")) {
            $("accuracy.textContent") = (total ? Math.round(correct / total * 100) : 0) + "%";
            $("accuracy").textContent = (total ? Math.round(correct / total * 100) : 0) + "%";
        }

        if ($("wrongSummary")) {
            $("wrongSummary").textContent = "共 " + wrong + " 題錯題";
        }

        const wrongList = $("wrongList");
        if (wrongList) {
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
        }

        showScreen("result");
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
            if (confirm("確定要退出測驗嗎？目前作答進度將會結束。")) {
                showScreen("home");
            }
        }
    });

    if ($("prevBtn")) {
        $("prevBtn").addEventListener("click", () => {
            if (currentIndex > 0) {
                currentIndex--;
                renderQuestion();
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
            } else {
                finishQuiz();
            }
        });
    }

    loadBank();
})();
