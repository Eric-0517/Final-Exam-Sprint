const state = {
  bank: [],
  quiz: [],
  answers: {},
  index: 0
};

const $ = s => document.querySelector(s);

const screens = {
  home: $('#home'),
  quiz: $('#quiz'),
  result: $('#result')
};

function show(n) {
  Object.values(screens).forEach(x => x.classList.remove('active'));
  screens[n].classList.add('active');
  window.scrollTo(0, 0);
}

function shuffle(a) {
  const x = [...a];

  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }

  return x;
}

// 題目與選項只顯示英文，不影響詳解的中文翻譯
function cleanQuestionText(value) {
  return String(value || '')
    .replace(/[（(][^）)]*[\u3400-\u9FFF\uF900-\uFAFF][^）)]*[）)]/g, '')
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=[A-Za-z])/g, '$1 ')
    .trim();
}

// 詳解保留中文，只移除指定的制式句子
function cleanExplanation(value) {
  return String(value || '請重新閱讀題幹與選項。')
    .replace(/請依題幹語意、文法或文章內容判斷此選項。?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// 建立閱讀測驗圖片
function createReadingImage(q) {
  if (q.type !== 'reading' || !q.image) {
    return null;
  }

  const img = document.createElement('img');
  img.src = q.image;
  img.alt = 'Reading passage';
  img.className = 'reading-image';
  img.loading = 'lazy';

  img.onerror = () => {
    img.alt = 'Reading passage image could not be loaded';
    img.style.display = 'none';
  };

  return img;
}

// 顯示題目與閱讀圖片
function renderQuestionContent(container, q, review = false) {
  container.innerHTML = '';

  const img = createReadingImage(q);

  if (img) {
    container.appendChild(img);
  }

  const prompt = document.createElement('div');
  prompt.className = review ? 'review-question-text' : 'reading-question';
  prompt.textContent = cleanQuestionText(q.question);

  container.appendChild(prompt);
}

function start() {
  if (state.bank.length === 0) {
    alert('目前沒有可作答的題目。');
    return;
  }

  state.quiz = shuffle(state.bank).slice(
    0,
    Math.min(50, state.bank.length)
  );

  state.answers = {};
  state.index = 0;

  $('#total').textContent = state.quiz.length;

  show('quiz');
  render();
}

function render() {
  const q = state.quiz[state.index];

  $('#qNo').textContent = state.index + 1;

  $('#progressBar').style.width =
    ((state.index + 1) / state.quiz.length * 100) + '%';

  renderQuestionContent($('#questionText'), q);

  const box = $('#options');
  box.innerHTML = '';

  ['A', 'B', 'C', 'D'].forEach(k => {
    const b = document.createElement('button');

    b.className =
      'option' +
      (state.answers[q.id] === k ? ' selected' : '');

    b.innerHTML =
      '<span class="option-key">' + k + '</span>' +
      '<span>' +
      escapeHtml(cleanQuestionText(q.options[k] || '')) +
      '</span>';

    b.onclick = () => {
      state.answers[q.id] = k;
      render();
    };

    box.appendChild(b);
  });

  $('#prevBtn').disabled = state.index === 0;
  $('#prevBtn').style.opacity = state.index === 0 ? 0.45 : 1;

  $('#nextBtn').textContent =
    state.index === state.quiz.length - 1 ? '交卷' : '下一題';
}

function next() {
  if (!state.answers[state.quiz[state.index].id]) {
    alert('請先選擇答案。');
    return;
  }

  if (state.index < state.quiz.length - 1) {
    state.index++;
    render();
  } else {
    submit();
  }
}

function submit() {
  const correct = state.quiz.filter(
    q => state.answers[q.id] === q.answer
  ).length;

  const wrong = state.quiz.length - correct;

  $('#score').textContent = correct * 2;
  $('#correctCount').textContent = correct;
  $('#wrongCount').textContent = wrong;

  $('#accuracy').textContent =
    Math.round(correct / state.quiz.length * 100) + '%';

  $('#wrongSummary').textContent = '共 ' + wrong + ' 題錯題';

  const list = $('#wrongList');
  list.innerHTML = '';

  state.quiz.forEach((q, i) => {
    if (state.answers[q.id] === q.answer) return;

    const item = document.createElement('div');
    item.className = 'wrong-item';

    const title = document.createElement('div');
    title.className = 'wrong-title';
    title.textContent =
      '第 ' + (i + 1) + ' 題｜你的答案：' +
      (state.answers[q.id] || '未作答') +
      '｜正確答案：' + q.answer;

    item.appendChild(title);

    const question = document.createElement('div');
    question.className = 'review-question';
    renderQuestionContent(question, q, true);
    item.appendChild(question);

    const options = document.createElement('div');
    options.className = 'review-options';

    options.innerHTML = ['A', 'B', 'C', 'D'].map(k =>
      '<p><b>' + k + '.</b> ' +
      escapeHtml(cleanQuestionText(q.options[k] || '')) +
      (k === q.answer ? ' ✓ 正確答案' : '') +
      '</p>'
    ).join('');

    item.appendChild(options);

    const explanation = document.createElement('div');
    explanation.className = 'explanation';
    explanation.textContent = cleanExplanation(q.explanation);

    item.appendChild(explanation);
    list.appendChild(item);
  });

  show('result');
}

$('#startBtn').onclick = start;

$('#quitBtn').onclick = () => show('home');

$('#prevBtn').onclick = () => {
  if (state.index > 0) {
    state.index--;
    render();
  }
};

$('#nextBtn').onclick = next;

$('#homeBtn').onclick = () => show('home');

$('#againBtn').onclick = start;

fetch('english-questions.json')
  .then(r => {
    if (!r.ok) {
      throw new Error('題庫讀取失敗');
    }

    return r.json();
  })
  .then(d => {
    state.bank = d;
    $('#bankCount').textContent = d.length;
    $('#startBtn').disabled = d.length === 0;
  })
  .catch(() => {
    alert('題庫載入失敗，請確認網站伺服器開啟。');
  });
