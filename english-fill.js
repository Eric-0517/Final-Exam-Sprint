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

  function swalBase() {
    return {
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: false
    };
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

  function showScreen(name) {
    ["home", "quiz", "result"].forEach(id => {
      $(id).classList.toggle("active", id === name);
    });

    window.scrollTo(0, 0);
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
      const response = await fetch(BANK_URL, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          `題庫載入失敗（HTTP ${response.status}），請確認 JSON 檔案是否存在。`
        );
      }

      const data = await response.json();

      questionBank = Array.isArray(data)
        ? data
        : data.questions;

      if (!Array.isArray(questionBank) || !questionBank.length) {
        throw new Error("題庫格式錯誤，找不到題目資料。");
      }

      questionBank = questionBank.filter(question => {
        return (
          question &&
          question.chinese &&
          (question.question || question.english) &&
          Array.isArray(question.answers) &&
          question.answers.length >= 2
        );
      });

      if (!questionBank.length) {
        throw new Error("題庫內沒有符合格式的填充題。");
      }

      $("bankCount").textContent = questionBank.length;
      $("startBtn").disabled = false;

    } catch (error) {
      console.error("英文題庫載入失敗：", error);

      $("bankCount").textContent = "載入失敗";
      $("startBtn").disabled = true;

      $("loadError").hidden = false;
      $("loadError").textContent = error.message;

      await showAlert({
        title: "題庫載入失敗",
        text: error.message +
          "\n\n請確認 english-fill-questions.json 是否放在正確位置。",
        icon: "error"
      });
    }
  }

  async function startQuiz() {
    if (!questionBank.length) {
      await showAlert({
        title: "目前沒有可作答的題目",
        text: "請確認題庫是否已成功載入，然後重新整理頁面。",
        icon: "warning"
      });

      return;
    }

    if (submitted === false && quizQuestions.length &&
        $("quiz").classList.contains("active")) {

      const shouldRestart = await confirmAction({
        title: "確定要重新開始？",
        text: "目前的作答內容將會被清除。",
        icon: "warning",
        confirmText: "重新開始",
        cancelText: "繼續作答"
      });

      if (!shouldRestart) return;
    }

    clearInterval(timerInterval);

    quizQuestions = shuffle(questionBank).slice(
      0,
      Math.min(QUESTIONS_PER_QUIZ, questionBank.length)
    );

    answers = quizQuestions.map(() => ["", ""]);
    currentIndex = 0;
    seconds = 0;
    submitted = false;

    $("total").textContent = quizQuestions.length;

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

    $("chineseText").textContent = question.chinese;

    $("englishText").textContent =
      question.question || question.english;

    $("answer1").value = answers[currentIndex][0];
    $("answer2").value = answers[currentIndex][1];

    $("prevBtn").disabled = currentIndex === 0;

    $("nextBtn").textContent =
      currentIndex === quizQuestions.length - 1
        ? "檢查並交卷"
        : "下一題";
  }

  function previousQuestion() {
    saveCurrentAnswer();

    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  }

  async function nextQuestion() {
    saveCurrentAnswer();

    if (currentIndex < quizQuestions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      await submitQuiz();
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
    return question.answers;
  }

  async function submitQuiz() {
    if (submitted) return;

    saveCurrentAnswer();

    const unanswered = answers.reduce((count, answer) => {
      return count +
        (normalizeAnswer(answer[0]) ? 0 : 1) +
        (normalizeAnswer(answer[1]) ? 0 : 1);
    }, 0);

    const confirmed = await confirmAction({
      title: unanswered > 0
        ? "還有空格尚未作答"
        : "確定要交卷？",
      text: unanswered > 0
        ? `目前還有 ${unanswered} 格未作答，未作答的空格將以 0 分計算。確定交卷嗎？`
        : "交卷後將無法修改答案，並立即顯示測驗成績。",
      icon: unanswered > 0 ? "warning" : "question",
      confirmText: "確定交卷",
      cancelText: "繼續作答"
    });

    if (!confirmed) return;

    submitted = true;
    clearInterval(timerInterval);

    showResult();

    await showAlert({
      title: "測驗完成！",
      text: "本次測驗已完成批改。",
      icon: "success"
    });
  }

  function showResult() {
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;

    const results = quizQuestions.map((question, index) => {
      const correctAnswers = getQuestionAnswers(question);
      const userAnswers = answers[index];

      const firstAccepted = getAcceptedAnswers(correctAnswers[0]);
      const secondAccepted = getAcceptedAnswers(correctAnswers[1]);

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
              正確答案：${escapeHTML(answer1.join(" / "))}
            </div>

            <div class="${result.secondCorrect ? "answer-correct" : "answer-wrong"}">
              第二格：${escapeHTML(result.userAnswers[1] || "未作答")}
              ${result.secondCorrect ? "（正確，5分）" : "（錯誤，0分）"}
              <br>
              正確答案：${escapeHTML(answer2.join(" / "))}
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

  async function quitQuiz() {
    const confirmed = await confirmAction({
      title: "確定要退出測驗嗎？",
      text: "目前的作答內容將不會保留。",
      icon: "warning",
      confirmText: "確定退出",
      cancelText: "繼續作答"
    });

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
