const state = { bank: [], quiz: [], answers: {}, index: 0 };
const $ = s => document.querySelector(s);
const screens = { home: $('#home'), quiz: $('#quiz'), result: $('#result') };

function show(name) {
    Object.values(screens).forEach(x => x.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo(0, 0);
}

function start() {
    state.quiz = [...state.bank]; 
    state.answers = {};
    state.index = 0;
    show('quiz');
    renderQuestion();
}

function renderQuestion() {
    const q = state.quiz[state.index];
    const totalQ = state.quiz.length;
    
    $('#qNo').textContent = state.index + 1;
    $('#progressBar').style.width = ((state.index + 1) / totalQ * 100) + '%';
    
  
    const textEl = $('#questionText');
    if (textEl) textEl.textContent = q.question;
    
    const imgEl = $('#questionImage');
    if (imgEl) {
        if (q.image) {
            imgEl.src = q.image;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
    }

    const box = $('#options');
    box.innerHTML = '';
    
    ['A', 'B', 'C', 'D'].forEach(k => {
        if (q.options && q.options[k]) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'option' + (state.answers[q.id] === k ? ' selected' : '');
            b.innerHTML = `<span class="option-key">${k}</span><span class="option-text">${q.options[k]}</span>`;
            b.onclick = () => {
                state.answers[q.id] = k;
                renderQuestion();
            };
            box.appendChild(b);
        }
    });

    $('#prevBtn').disabled = state.index === 0;
    $('#prevBtn').style.opacity = state.index === 0 ? .45 : 1;
    $('#nextBtn').textContent = state.index === totalQ - 1 ? '交卷' : '下一題';
}

function next() {
    if (!state.answers[state.quiz[state.index].id]) {
        alert('請先選擇答案。');
        return;
    }
    const totalQ = state.quiz.length;
    if (state.index < totalQ - 1) {
        state.index++;
        renderQuestion();
    } else {
        submit();
    }
}

function prev() {
    if (state.index > 0) {
        state.index--;
        renderQuestion();
    }
}

function submit() {
    const totalQ = state.quiz.length;
    const correct = state.quiz.filter(q => state.answers[q.id] === q.answer).length;
    const wrong = totalQ - correct;
    
    $('#score').textContent = correct * 2;
    $('#correctCount').textContent = correct;
    $('#wrongCount').textContent = wrong;
    $('#accuracy').textContent = Math.round(correct / totalQ * 100) + '%';
    $('#wrongSummary').textContent = `共 ${wrong} 題錯題`;

    const list = $('#wrongList');
    list.innerHTML = '';
    
    state.quiz.forEach((q, i) => {
        if (state.answers[q.id] === q.answer) return;
        
        const item = document.createElement('div');
        item.className = 'wrong-item';
        
        item.innerHTML = `
            <div class="wrong-title">第 ${i + 1} 題 你的答案：${state.answers[q.id] || '未作答'} ｜ 正確答案：${q.answer}</div>
            <div class="wrong-question-text" style="font-weight:bold; margin-bottom:8px;">${q.question}</div>
            <div class="answer-line" style="color:#666; font-size:0.9rem;">本題 2 分。</div>
        `;
        list.appendChild(item);
    });

    show('result');
}

document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'start') start();
    if (act === 'home') show('home');
    if (act === 'quit') show('home');
});

$('#nextBtn').onclick = next;
$('#prevBtn').onclick = prev;

fetch('major2.json')
    .then(r => r.json())
    .then(data => {
        state.bank = data.filter(q => q.answer);
        $('#bankCount').textContent = state.bank.length;
    })
    .catch(() => {
        $('#bankCount').textContent = '載入失敗';
    });
