(() => {
  "use strict";

  const BANK_URL = "english-fill-questions.json";
  const QUESTIONS_PER_QUIZ = 10;
  const POINTS_PER_BLANK = 5;

  const $ = id => document.getElementById(id);

  let questionBank = [];
  let quizQuestions = [];
  let answers = [];
  let currentIndex = 0;
  let seconds = 0;
  let timerInterval = null;
  let submitted = false;

  const screens = ["home", "quiz", "result"];

  function showScreen(name) {
    screens.forEach(id => {
      $(id).classList.toggle("active", id === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  async function loadQuestions() {
    try {
      const response = await fetch(BANK_URL);

      if (!response.ok) {
        throw new Error("無法讀取題庫檔案，請確認 JSON 檔案位置。");
      }

      const data = await response.json();

      questionBank = Array.isArray(data) ? data : data.questions;

      if (!Array.isArray(questionBank) || questionBank.length === 0) {
        throw new Error("題庫格式錯誤或沒有題目。");
      }

      $("bankCount").textContent = questionBank.length;
    } catch (error) {
      $("loadError").hidden = false;
      $("loadError").textContent = error.message;
      $("startBtn").disabled = true;
    }
  }

  function startQuiz() {
    if (questionBank.length === 0) return;

    quizQuestions = shuffle(questionBank).slice(
      0,
      Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
    );

    answers = quizQuestions.map(() => ["", ""]);
    currentIndex = 0;
    seconds = 0;
    submitted = false;

    $("total").textContent = quizQuestions.length;

    clearInterval(timerInterval);
    updateTimer();

    timerInterval = setInterval(() => {
      seconds++;
      updateTimer();
    }, 1000);

    showScreen("quiz");
    renderQuestion();
  }

  function updateTimer() {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    $("timer").textContent =
      String(minutes).padStart(2, "0") +
      ":" +
      String(remainingSeconds).padStart(2, "0");
  }

  function saveCurrentAnswer() {
    if (!quizQuestions[currentIndex]) return;

    answers[currentIndex][0] = $("answer1").value;
    answers[currentIndex][1] = $("answer2").value;
  }

  function renderQuestion() {
    const question = quizQuestions[currentIndex];

    if (!question) return;

    $("qNo").textContent = currentIndex + 1;
    $("questionNumber").textContent =
      `第 ${currentIndex + 1} / ${quizQuestions.length} 題`;

    $("progressBar").style.width =
      ((currentIndex + 1) / quizQuestions.length * 100) + "%";

    $("chineseText").textContent = question.chinese || "";
    $("englishText").textContent =
      question.question || question.english || "";

    $("answer1").value = answers[currentIndex][0];
    $("answer2").value = answers[currentIndex][1];

    $("prevBtn").disabled = currentIndex === 0;

    if (currentIndex === quizQuestions.length - 1) {
      $("nextBtn").textContent = "檢查並交卷";
    } else {
      $("nextBtn").textContent = "下一題";
    }
  }

  function previousQuestion() {
    saveCurrentAnswer();

    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  }

  function nextQuestion() {
    saveCurrentAnswer();

    if (currentIndex < quizQuestions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      submitQuiz();
    }
  }

  function normalizeAnswer(value) {
    return String(value ?? "").trim();
  }

  function getAcceptedAnswers(answerData) {
    if (Array.isArray(answerData)) {
      return answerData.map(normalizeAnswer);
    }

    if (typeof answerData === "string") {
      return answerData
        .split("/")
        .map(normalizeAnswer)
        .filter(Boolean);
    }

    return [];
  }

  function isCorrect(userAnswer, acceptedAnswers) {
    const input = normalizeAnswer(userAnswer);

    if (!input) return false;

    return acceptedAnswers.some(answer => input === answer);
  }

  function getQuestionAnswers(question) {
    if (Array.isArray(question.answers)) {
      return question.answers;
    }

    return [
      question.answer1 || question.answer?.[0] || "",
      question.answer2 || question.answer?.[1] || ""
    ];
  }

  function submitQuiz() {
    if (submitted) return;

    saveCurrentAnswer();

    const confirmed = window.confirm("確定要交卷嗎？交卷後將無法修改答案。");

    if (!confirmed) return;

    submitted = true;
    clearInterval(timerInterval);

    showResult();
  }

  function showResult() {
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;

    const results = quizQuestions.map((question, index) => {
      const correctAnswers = getQuestionAnswers(question);

      const firstAccepted = getAcceptedAnswers(correctAnswers[0]);
      const secondAccepted = getAcceptedAnswers(correctAnswers[1]);

      const userAnswers = answers[index];

      const firstCorrect = isCorrect(userAnswers[0], firstAccepted);
      const secondCorrect = isCorrect(userAnswers[1], secondAccepted);

      if (firstCorrect) {
        score += POINTS_PER_BLANK;
        correctCount++;
      } else {
        wrongCount++;
      }

      if (secondCorrect) {
        score += POINTS_PER_BLANK;
        correctCount++;
      } else {
        wrongCount++;
      }

      return {
        question,
        userAnswers,
        correctAnswers,
        firstCorrect,
        secondCorrect
      };
    });

    const totalBlanks = quizQuestions.length * 2;
    const accuracy = Math.round(correctCount / totalBlanks * 100);

    $("score").textContent = score;
    $("correctCount").textContent = correctCount;
    $("wrongCount").textContent = wrongCount;
    $("accuracy").textContent = accuracy + "%";

    $("wrongSummary").textContent =
      `答對 ${correctCount} 格／共 ${totalBlanks} 格`;

    $("wrongList").innerHTML = results.map((result, index) => {
      const q = result.question;

      const answer1 = getAcceptedAnswers(result.correctAnswers[0]);
      const answer2 = getAcceptedAnswers(result.correctAnswers[1]);

      const correctText1 = answer1.join(" / ");
      const correctText2 = answer2.join(" / ");

      return `
        <div class="review-card">
          <div class="review-question">
            第 ${index + 1} 題｜${escapeHTML(q.chinese || "")}
          </div>

          <div class="review-english">
            ${escapeHTML(q.question || q.english || "")}
          </div>

          <div class="review-answer">
            <div class="${result.firstCorrect ? "answer-correct" : "answer-wrong"}">
              第一格：${escapeHTML(result.userAnswers[0] || "未作答")}
              ${result.firstCorrect ? "（正確，5分）" : "（錯誤，0分）"}
              <br>
              正確答案：${escapeHTML(correctText1)}
            </div>

            <div class="${result.secondCorrect ? "answer-correct" : "answer-wrong"}">
              第二格：${escapeHTML(result.userAnswers[1] || "未作答")}
              ${result.secondCorrect ? "（正確，5分）" : "（錯誤，0分）"}
              <br>
              正確答案：${escapeHTML(correctText2)}
            </div>
          </div>
        </div>
      `;
    }).join("");

    showScreen("result");
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

  function quitQuiz() {
    const confirmed = window.confirm("確定要退出測驗嗎？目前作答紀錄將不會保留。");

    if (!confirmed) return;

    clearInterval(timerInterval);
    submitted = true;
    showScreen("home");
  }

  function returnHome() {
    clearInterval(timerInterval);
    submitted = true;
    showScreen("home");
  }

  $("startBtn").addEventListener("click", startQuiz);
  $("prevBtn").addEventListener("click", previousQuestion);
  $("nextBtn").addEventListener("click", nextQuestion);
  $("submitBtn").addEventListener("click", submitQuiz);
  $("quitBtn").addEventListener("click", quitQuiz);
  $("homeBtn").addEventListener("click", returnHome);
  $("againBtn").addEventListener("click", startQuiz);

  $("answer1").addEventListener("input", saveCurrentAnswer);
  $("answer2").addEventListener("input", saveCurrentAnswer);

  loadQuestions();
})();
