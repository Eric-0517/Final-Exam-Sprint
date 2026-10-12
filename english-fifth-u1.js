(() => {
    "use strict";

    const BANK_URL = "englishbook-questions.json";
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
            $(screenId).classList.toggle(
                "active",
                screenId === id
            );
        });
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
                throw new Error(
                    "題庫格式錯誤，找不到 questions 陣列。"
                );
            }

            questionBank = rawQuestions.map((question, index) => {
                const options = question.options || {};
                const answer = String(
                    question.answer || ""
                ).trim().toUpperCase();

                return {
                    id: question.id || "englishbook-" + (index + 1),
                    subject: question.subject || "英文第五冊 Unit 1",
                    source: question.source || "",
                    question: String(question.question || ""),
                    options,
                    answer,
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
                    "沒有格式正確且具有標準答案的 ABCD 選擇題。"
                );
            }

            $("bankCount").textContent = questionBank.length;
            startButton.disabled = false;

        } catch (error) {
            $("bankCount").textContent = "載入失敗";
            $("loadError").hidden = false;
            $("loadError").textContent =
                error.message +
                " 請確認 HTML、JS、JSON 位於同一資料夾。";
        }
    }

    function startQuiz() {
        if (!questionBank.length) return;

        quizQuestions = shuffle(questionBank).slice(
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

        $("total").textContent = quizQuestions.length;

        showScreen("quiz");
        renderQuestion();
    }

    function renderQuestion() {
        const question = quizQuestions[currentIndex];

        $("qNo").textContent = currentIndex + 1;
        $("total").textContent = quizQuestions.length;

        $("progressBar").style.width =
            ((currentIndex + 1) /
                quizQuestions.length * 100) + "%";

        $("questionText").textContent = question.question;
        $("options").innerHTML = "";

        LETTERS.forEach((letter) => {
            const button = document.createElement("button");

            button.type = "button";
            button.className = "option";

            button.classList.toggle(
                "selected",
                userAnswers[currentIndex] === letter
            );

            button.setAttribute(
                "aria-pressed",
                userAnswers[currentIndex] === letter
                    ? "true"
                    : "false"
            );

            button.innerHTML =
                '<span class="option-letter">' +
                letter +
                '</span><span class="option-text">' +
                escapeHTML(question.options[letter]) +
                '</span>';

            button.addEventListener("click", () => {
                userAnswers[currentIndex] = letter;
                renderQuestion();
            });

            $("options").appendChild(button);
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
        let wrong = 0;

        quizQuestions.forEach((question, index) => {
            if (userAnswers[index] === question.answer) {
                correct++;
            } else {
                wrong++;
            }
        });

        const score = correct * POINTS_PER_QUESTION;
        const accuracy = total
            ? Math.round(correct / total * 100)
            : 0;

        $("score").textContent = score;
        $("correctCount").textContent = correct;
        $("wrongCount").textContent = wrong;
        $("accuracy").textContent = accuracy + "%";

        $("wrongSummary").textContent =
            "共 " + wrong + " 題需要訂正";

        const wrongList = $("wrongList");
        wrongList.innerHTML = "";

        quizQuestions.forEach((question, index) => {
            const selected = userAnswers[index];

            if (selected === question.answer) return;

            const item = document.createElement("article");
            item.className = "wrong-item";

            const selectedText = selected
                ? selected + "．" +
                    escapeHTML(question.options[selected])
                : "未作答";

            item.innerHTML =
                '<div class="wrong-question">' +
                    (index + 1) + ". " +
                    escapeHTML(question.question) +
                '</div>' +
                '<p><strong>你的答案：</strong>' +
                    selectedText +
                '</p>' +
                '<p><strong>正確答案：</strong>' +
                    question.answer + "．" +
                    escapeHTML(
                        question.options[question.answer]
                    ) +
                '</p>' +
                (
                    question.explanation.trim()
                        ? '<p><strong>詳解：</strong>' +
                            escapeHTML(question.explanation) +
                          '</p>'
                        : ""
                );

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
        if (currentIndex < quizQuestions.length - 1) {
            currentIndex++;
            renderQuestion();
        } else {
            finishQuiz();
        }
    });

    $("quitBtn").addEventListener("click", () => {
        if (window.confirm(
            "確定要退出測驗並查看目前成績嗎？未作答題目會計為答錯。"
        )) {
            finishQuiz();
        }
    });

    $("homeBtn").addEventListener("click", () => {
        showScreen("home");
    });

    $("againBtn").addEventListener("click", startQuiz);

    loadBank();
})();
