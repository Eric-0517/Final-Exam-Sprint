(() => {
  "use strict";
  const BANK_URL = "economicsbook-questions.json";
  const QUESTIONS_PER_QUIZ = 40;
  const POINTS_PER_QUESTION = 2.5;
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
        id: q.id || "economics-" + (i + 1),
        question: String(q.question || "").trim(),
        options: q.options || {},
        answer: String(q.answer || "").trim().toUpperCase(),
        explanation: q.explanation || "",
        image: q.image || "",
        optionImages: q.optionImages || {}
      })).filter(q => q.question && LETTERS.every(letter => q.options[letter] !== undefined));
      if (!questionBank.length) throw new Error("題庫沒有格式正確的選擇題。");
      $("bankCount").textContent = questionBank.length;
      startButton.disabled = false;
    } catch (error) {
      $("bankCount").textContent = "載入失敗";
      $("loadError").hidden = false;
      $("loadError").textContent = error.message + " 請確認 economics.html、economics.js、economics-questions.json 與 economics-assets 資料夾的位置。";
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
    const questionImage = $("questionImage");
    if (q.image) {
      questionImage.src = q.image;
      questionImage.hidden = false;
    } else {
      questionImage.removeAttribute("src");
      questionImage.hidden = true;
    }
    const box = $("options");
    box.innerHTML = "";
    LETTERS.forEach(letter => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option" + (userAnswers[currentIndex] === letter ? " selected" : "");
      button.setAttribute("aria-pressed", userAnswers[currentIndex] === letter ? "true" : "false");
      const key = document.createElement("span"); key.className = "option-key"; key.textContent = letter;
      const textWrap = document.createElement("span"); textWrap.className = "option-text";
      textWrap.textContent = q.options[letter];
      button.append(key, textWrap);
      if (q.optionImages[letter]) {
        const image = document.createElement("img");
        image.className = "option-image"; image.src = q.optionImages[letter]; image.alt = "選項 " + letter + " 圖片";
        textWrap.appendChild(image);
      }
      button.addEventListener("click", () => { userAnswers[currentIndex] = letter; renderQuestion(); });
      box.appendChild(button);
    });
    $("prevBtn").disabled = currentIndex === 0;
    $("nextBtn").textContent = currentIndex === quizQuestions.length - 1 ? "交卷並看結果" : "下一題";
  }
  function finishQuiz() {
    const graded = quizQuestions.map((q, i) => ({ q, i, user: userAnswers[i], answer: q.answer }))
      .filter(item => LETTERS.includes(item.answer));
    const correctItems = graded.filter(item => item.user === item.answer);
    const wrongItems = graded.filter(item => item.user !== item.answer);
    const ungraded = quizQuestions.length - graded.length;
    $("score").textContent = graded.length ? (correctItems.length * POINTS_PER_QUESTION).toFixed(1).replace(/\.0$/, "") : "—";
    $("scoreLabel").textContent = graded.length ? "分（僅計算已填答案的題目）" : "答案尚未填入，暫時無法計分";
    $("correctCount").textContent = correctItems.length;
    $("wrongCount").textContent = wrongItems.length;
    $("accuracy").textContent = graded.length ? Math.round(correctItems.length / graded.length * 100) + "%" : "—";
    $("gradingNotice").textContent = ungraded
      ? "本回有 " + ungraded + " 題尚未設定正確答案，這些題目不會計分。請在 economics-questions.json 的每題 answer 欄填入 A、B、C 或 D，再重新整理網站即可自動批改。"
      : "本回所有題目皆已設定答案，已完成自動批改。";
    $("wrongSummary").textContent = "已設定答案 " + graded.length + " 題｜未設定答案 " + ungraded + " 題";
    const list = $("wrongList"); list.innerHTML = "";
    quizQuestions.forEach((q, i) => {
      const item = document.createElement("article"); item.className = "wrong-item";
      const title = document.createElement("div"); title.className = "wrong-question";
      title.textContent = "第 " + (i + 1) + " 題｜你的答案：" + (userAnswers[i] || "未作答") + "｜" + (LETTERS.includes(q.answer) ? "正確答案：" + q.answer : "答案尚未設定");
      item.appendChild(title);
      const prompt = document.createElement("div"); prompt.textContent = q.question; item.appendChild(prompt);
      if (q.image) { const img = document.createElement("img"); img.className = "review-question-image"; img.src = q.image; img.alt = "題目圖片"; item.appendChild(img); }
      const opts = document.createElement("div"); opts.className = "review-options";
      LETTERS.forEach(letter => {
        const p = document.createElement("p");
        const strong = document.createElement("strong"); strong.textContent = letter + ". "; p.appendChild(strong);
        p.appendChild(document.createTextNode(q.options[letter]));
        if (q.optionImages[letter]) { const img = document.createElement("img"); img.className = "review-option-image"; img.src = q.optionImages[letter]; img.alt = "選項 " + letter + " 圖片"; p.appendChild(img); }
        if (LETTERS.includes(q.answer) && letter === q.answer) { const answer = document.createElement("span"); answer.className = "correct-answer"; answer.textContent = "　✓ 正確答案"; p.appendChild(answer); }
        opts.appendChild(p);
      });
      item.appendChild(opts);
      if (q.explanation) { const exp = document.createElement("div"); exp.className = "explanation"; exp.textContent = "詳解：" + q.explanation; item.appendChild(exp); }
      list.appendChild(item);
    });
    showScreen("result");
  }
  $("startBtn").addEventListener("click", startQuiz);
  $("prevBtn").addEventListener("click", () => { if (currentIndex > 0) { currentIndex--; renderQuestion(); } });
  $("nextBtn").addEventListener("click", () => { if (currentIndex < quizQuestions.length - 1) { currentIndex++; renderQuestion(); } else finishQuiz(); });
  $("quitBtn").addEventListener("click", () => { if (confirm("確定退出測驗？目前作答進度將會結束。")) showScreen("home"); });
  $("homeBtn").addEventListener("click", () => showScreen("home"));
  $("againBtn").addEventListener("click", startQuiz);
  loadBank();
})();
