(() => {
  "use strict";
  const BANK_URL = "chinese-questions.json";
  const QUESTIONS_PER_QUIZ = 20;
  const POINTS_PER_QUESTION = 5;
  const LETTERS = ["A", "B", "C", "D"];
  const $ = (id) => document.getElementById(id);
  const screens = ["home", "quiz", "result"];
  let questionBank = [], quizQuestions = [], userAnswers = [], currentIndex = 0;

  function showScreen(id) {
    screens.forEach((screenId) => $(screenId).classList.toggle("active", screenId === id));
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

  async function loadBank() {
    const startButton = $("startBtn");
    startButton.disabled = true;

    try {
      const response = await fetch(BANK_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("題庫載入失敗（HTTP " + response.status + "）。");

      const data = await response.json();
      const rawQuestions = Array.isArray(data) ? data : data.questions;

      if (!Array.isArray(rawQuestions)) throw new Error("題庫格式錯誤，找不到題目陣列。");

      questionBank = rawQuestions.map((q, i) => ({
        id: q.id || "chinese-" + (i + 1),
        passage: q.passage || "",
        question: String(q.question || ""),
        options: q.options || {},
        answer: String(q.answer || "").trim().toUpperCase(),
        explanation: q.explanation || ""
      })).filter(q =>
        q.question &&
        LETTERS.every(letter => q.options[letter] !== undefined) &&
        LETTERS.includes(q.answer) &&
        !LETTERS.some(letter => String(q.options[letter]).includes("無內容"))
      );

      if (!questionBank.length) throw new Error("題庫沒有格式正確的選擇題。");

      $("bankCount").textContent = questionBank.length + " 題";
      startButton.disabled = false;
    } catch (error) {
      $("bankCount").textContent = "載入失敗";
      $("loadError").hidden = false;
      $("loadError").textContent = error.message + " 請確認 chinese.html、chinese.js 與 chinese-questions.json 位於同一資料夾。";
      console.error(error);
    }
  }

  function startQuiz() {
    if (!questionBank.length) return alert("目前沒有可作答的題目。");

    quizQuestions = shuffle(questionBank).slice(0, Math.min(QUESTIONS_PER_QUIZ, questionBank.length));
    userAnswers = new Array(quizQuestions.length).fill(null);
    currentIndex = 0;

    $("total").textContent = quizQuestions.length;
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    const q = quizQuestions[currentIndex];

    $("qNo").textContent = currentIndex + 1;
    $("total").textContent = quizQuestions.length;
    $("progressBar").style.width = ((currentIndex + 1) / quizQuestions.length * 100) + "%";
    $("questionText").textContent = q.question;

    const passage = $("passage");
    passage.textContent = q.passage;
    passage.hidden = !q.passage;

    const box = $("options");
    box.innerHTML = "";

    LETTERS.forEach(letter => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option" + (userAnswers[currentIndex] === letter ? " selected" : "");
      button.setAttribute("aria-pressed", userAnswers[currentIndex] === letter ? "true" : "false");

      const key = document.createElement("span");
      key.className = "option-key";
      key.textContent = letter;

      const text = document.createElement("span");
      text.textContent = q.options[letter];

      button.append(key, text);
      button.addEventListener("click", () => {
        userAnswers[currentIndex] = letter;
        renderQuestion();
      });

      box.appendChild(button);
    });

    $("prevBtn").disabled = currentIndex === 0;
    $("nextBtn").textContent = currentIndex === quizQuestions.length - 1 ? "交卷並看結果" : "下一題";
  }

  function finishQuiz() {
    let correct = 0;
    quizQuestions.forEach((q, i) => {
      if (userAnswers[i] === q.answer) correct++;
    });

    const wrong = quizQuestions.length - correct;

    $("score").textContent = correct * POINTS_PER_QUESTION;
    $("correctCount").textContent = correct;
    $("wrongCount").textContent = wrong;
    $("accuracy").textContent = Math.round(correct / quizQuestions.length * 100) + "%";
    $("wrongSummary").textContent = "共 " + wrong + " 題錯題";

    const list = $("wrongList");
    list.innerHTML = "";

    quizQuestions.forEach((q, i) => {
      if (userAnswers[i] === q.answer) return;

      const item = document.createElement("article");
      item.className = "wrong-item";

      const title = document.createElement("div");
      title.className = "wrong-question";
      title.textContent = "第 " + (i + 1) + " 題｜你的答案：" + (userAnswers[i] || "未作答") + "｜正確答案：" + q.answer;
      item.appendChild(title);

      if (q.passage) {
        const p = document.createElement("div");
        p.className = "review-passage";
        p.textContent = q.passage;
        item.appendChild(p);
      }

      const prompt = document.createElement("div");
      prompt.textContent = q.question;
      item.appendChild(prompt);

      const opts = document.createElement("div");
      opts.className = "review-options";

      LETTERS.forEach(letter => {
        const p = document.createElement("p");

        const strong = document.createElement("strong");
        strong.textContent = letter + ". ";
        p.appendChild(strong);

        p.appendChild(document.createTextNode(q.options[letter]));

        if (letter === q.answer) {
          const answer = document.createElement("span");
          answer.className = "correct-answer";
          answer.textContent = "　✓ 正確答案";
          p.appendChild(answer);
        }

        opts.appendChild(p);
      });

      item.appendChild(opts);

      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.textContent = "詳解：" + (q.explanation || "請重新閱讀題幹與選項。");
      item.appendChild(exp);

      list.appendChild(item);
    });

    if (!wrong) list.innerHTML = '<div class="empty">全部答對，沒有錯題！</div>';

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
    if (confirm("確定退出測驗？目前作答進度將會結束。")) showScreen("home");
  });

  $("homeBtn").addEventListener("click", () => showScreen("home"));
  $("againBtn").addEventListener("click", startQuiz);

  loadBank();
})();
