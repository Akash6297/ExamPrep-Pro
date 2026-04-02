/**
 * Main Application Logic for ExamPrep Pro
 */

import { StorageService } from './storage.js';
import { PDFParser } from './parser.js';

export class App {
    constructor() {
        this.currentQuestions = [];
        this.testConfig = {};
        this.activeTest = null;
        this.timerInterval = null;
        this.init();
    }

    async init() {
        // Initialize Icons
        lucide.createIcons();
        this.attachEventListeners();
        await this.loadDashboard();
    }

    attachEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        // Drag & Drop
        dropZone.onclick = () => fileInput.click();
        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        };
        dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) this.handleFileUploads(files);
        };

        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) this.handleFileUploads(files);
        };

        // Navigation
        document.getElementById('home-btn').onclick = () => this.showSection('dashboard');
        document.getElementById('history-btn').onclick = () => this.showSection('dashboard'); // Same for now

        // Config & Test
        document.getElementById('configure-test').onclick = () => this.showSection('config-section');
        document.getElementById('start-test').onclick = () => this.startTest();
        document.getElementById('quit-test').onclick = () => this.finishTest();
        document.getElementById('retry-btn').onclick = () => this.showSection('config-section');
        document.getElementById('home-from-result').onclick = () => this.showSection('dashboard');
        document.getElementById('back-to-dash').onclick = () => this.showSection('dashboard');

        // Manual & Editing
        document.getElementById('create-manual-btn').onclick = () => {
            this.currentQuestions = [];
            this.addBlankQuestion();
            this.showSection('preview-section');
        };
        document.getElementById('add-q-btn').onclick = () => this.addBlankQuestion();
        document.getElementById('add-q-image-btn').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,application/pdf';
            input.multiple = true;
            input.onchange = (e) => this.handleFileUploads(Array.from(e.target.files));
            input.click();
        };

        document.getElementById('clear-all-btn').onclick = () => this.clearAllQuestions();

        this.setupPreviewDropZone();
    }

    setupPreviewDropZone() {
        const previewSection = document.getElementById('preview-section');
        const previewList = document.getElementById('question-preview-list');

        previewSection.ondragover = (e) => {
            e.preventDefault();
            previewList.classList.add('drag-over');
        };
        previewSection.ondragleave = () => previewList.classList.remove('drag-over');
        previewSection.ondrop = (e) => {
            e.preventDefault();
            previewList.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) this.handleFileUploads(files);
        };
    }

    async handleFileUploads(files) {
        this.showStatus(`Preparing to process ${files.length} file(s)...`, true);
        
        let allNewQuestions = [];
        
        for (const file of files) {
            try {
                this.showStatus(`Processing: ${file.name}...`, true);
                let text = '';

                if (file.type === 'application/pdf') {
                    text = await PDFParser.extractText(file);
                } else if (file.type.startsWith('image/')) {
                    text = await this.handleImageOCR(file);
                } else {
                    continue; // Skip unsupported
                }

                const questions = PDFParser.parseQuestions(text);
                allNewQuestions = [...allNewQuestions, ...questions];

            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                this.showStatus(`Error in ${file.name}: ${error.message}`, true, true);
            }
        }

        if (allNewQuestions.length > 0) {
            // Append to existing questions
            this.currentQuestions = [...this.currentQuestions, ...allNewQuestions];
            this.renderPreview();
            this.showSection('preview-section');
            this.showStatus(`${allNewQuestions.length} questions added successfully!`, true);
            setTimeout(() => this.showStatus('', false), 3000);
            
            // Save to bank
            await StorageService.saveBank({
                name: `Merged Import (${new Date().toLocaleDateString()})`,
                questions: this.currentQuestions
            });
            await this.loadDashboard();
        } else {
            this.showStatus('No questions could be extracted.', true, true);
        }
    }

    async handleImageOCR(file) {
        return new Promise((resolve, reject) => {
            Tesseract.recognize(
                file,
                'eng',
                { logger: m => {
                    if (m.status === 'recognizing text') {
                        this.showStatus(`OCR Progress: ${Math.round(m.progress * 100)}%`, true);
                    }
                }}
            ).then(({ data: { text } }) => {
                resolve(text);
            }).catch(err => reject(err));
        });
    }

    renderPreview() {
        const container = document.getElementById('question-preview-list');
        if (this.currentQuestions.length === 0) {
            container.innerHTML = '<p class="empty-msg">No questions available. Click "Add Question" to start manually.</p>';
            return;
        }

        container.innerHTML = this.currentQuestions.map((q, i) => `
            <div class="preview-item animate-up" data-id="${q.id}">
                <button class="delete-q-btn" onclick="window.app.deleteQuestion(${i})"><i data-lucide="trash-2"></i></button>
                <div class="q-header">Question #${i + 1}</div>
                <div class="q-edit-area">
                    <textarea placeholder="Type your question here..." 
                        oninput="window.app.updateQuestion(${i}, 'text', this.value)">${q.text}</textarea>
                </div>
                <div class="options-edit-grid">
                    ${['A', 'B', 'C', 'D'].map(label => {
                        const opt = q.options.find(o => o.label === label) || { label, text: '' };
                        return `
                            <div class="opt-edit-row">
                                <button class="ans-selector ${q.answer === label ? 'correct' : ''}" 
                                    onclick="window.app.updateQuestion(${i}, 'answer', '${label}')">
                                    ${label}
                                </button>
                                <input type="text" class="opt-input" placeholder="Option ${label}" 
                                    value="${opt.text}" 
                                    oninput="window.app.updateOption(${i}, '${label}', this.value)">
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="hint-edit-area">
                    <i data-lucide="info"></i>
                    <input type="text" class="hint-input" placeholder="Add a hint/trick for this question..." 
                        value="${q.hint || ''}" 
                        oninput="window.app.updateQuestion(${i}, 'hint', this.value)">
                </div>
            </div>
        `).join('');
        
        lucide.createIcons();
    }

    addBlankQuestion() {
        const newQ = {
            id: Date.now(),
            text: '',
            options: [
                { label: 'A', text: '' },
                { label: 'B', text: '' },
                { label: 'C', text: '' },
                { label: 'D', text: '' }
            ],
            answer: 'A'
        };
        this.currentQuestions.push(newQ);
        this.renderPreview();
    }

    updateQuestion(index, field, value) {
        if (field === 'answer') {
            this.currentQuestions[index].answer = value;
            this.renderPreview(); // Re-render to update the 'correct' class
        } else {
            this.currentQuestions[index][field] = value;
        }
    }

    updateOption(index, label, value) {
        const opt = this.currentQuestions[index].options.find(o => o.label === label);
        if (opt) opt.text = value;
    }

    deleteQuestion(index) {
        this.currentQuestions.splice(index, 1);
        this.renderPreview();
    }

    clearAllQuestions() {
        if (confirm('Are you sure you want to clear all questions?')) {
            this.currentQuestions = [];
            this.renderPreview();
        }
    }

    async startTest() {
        const count = parseInt(document.getElementById('test-q-count').value);
        const timeLimit = parseInt(document.getElementById('test-time').value);
        const negMarking = parseFloat(document.getElementById('neg-marking').value);
        const shuffle = document.getElementById('shuffle-q').checked;

        let testPool = [...this.currentQuestions];
        if (shuffle) testPool = testPool.sort(() => Math.random() - 0.5);
        testPool = testPool.slice(0, Math.min(count, testPool.length));

        this.activeTest = {
            questions: testPool,
            answers: new Array(testPool.length).fill(null),
            timeRemaining: timeLimit * 60,
            currentIndex: 0,
            negMarking: negMarking,
            startTime: Date.now()
        };

        this.showSection('test-arena');
        this.renderArenaQuestion();
        this.startTimer();
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        const updateTimer = () => {
            const minutes = Math.floor(this.activeTest.timeRemaining / 60);
            const seconds = this.activeTest.timeRemaining % 60;
            document.getElementById('timer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (this.activeTest.timeRemaining <= 0) {
                this.finishTest();
            }
            this.activeTest.timeRemaining--;
        };

        updateTimer();
        this.timerInterval = setInterval(updateTimer, 1000);
    }

    renderArenaQuestion() {
        const q = this.activeTest.questions[this.activeTest.currentIndex];
        document.getElementById('current-q-num').textContent = this.activeTest.currentIndex + 1;
        document.getElementById('total-q-arena').textContent = this.activeTest.questions.length;

        const container = document.getElementById('question-display');
        container.innerHTML = `
            <div class="active-question-card">
                <p class="question-text">${q.text}</p>
                <div class="options-list">
                    ${q.options.map(opt => `
                        <button class="option-btn ${this.activeTest.answers[this.activeTest.currentIndex] === opt.label ? 'selected' : ''}" 
                                onclick="window.app.selectAnswer('${opt.label}')">
                            <span class="label">${opt.label}.</span> ${opt.text}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="arena-footer">
                <button class="btn-ghost" onclick="window.app.moveQ(-1)" ${this.activeTest.currentIndex === 0 ? 'disabled' : ''}>Previous</button>
                ${q.hint ? `<button class="btn-secondary" onclick="alert('Hint: ' + '${q.hint.replace(/'/g, "\\'")}')"><i data-lucide="help-circle"></i> View Hint</button>` : ''}
                <button class="btn-primary" onclick="window.app.moveQ(1)">
                    ${this.activeTest.currentIndex === this.activeTest.questions.length - 1 ? 'Finish Section' : 'Next Question'}
                </button>
            </div>
        `;

        this.renderNavigator();
    }

    renderNavigator() {
        const nav = document.getElementById('arena-q-navigator');
        nav.innerHTML = this.activeTest.questions.map((_, i) => `
            <div class="q-dot 
                ${this.activeTest.currentIndex === i ? 'active' : ''} 
                ${this.activeTest.answers[i] ? 'solved' : ''}" 
                onclick="window.app.goToQ(${i})">
                ${i + 1}
            </div>
        `).join('');
    }

    selectAnswer(label) {
        this.activeTest.answers[this.activeTest.currentIndex] = label;
        this.renderArenaQuestion();
    }

    moveQ(dir) {
        const newIdx = this.activeTest.currentIndex + dir;
        if (newIdx >= 0 && newIdx < this.activeTest.questions.length) {
            this.activeTest.currentIndex = newIdx;
            this.renderArenaQuestion();
        } else if (newIdx === this.activeTest.questions.length) {
            this.finishTest();
        }
    }

    goToQ(idx) {
        this.activeTest.currentIndex = idx;
        this.renderArenaQuestion();
    }

    async finishTest() {
        clearInterval(this.timerInterval);
        
        const results = {
            correct: 0,
            wrong: 0,
            skipped: 0,
            total: this.activeTest.questions.length,
            score: 0
        };

        this.activeTest.questions.forEach((q, i) => {
            const userAns = this.activeTest.answers[i];
            if (!userAns) results.skipped++;
            else if (userAns === q.answer) results.correct++;
            else results.wrong++;
        });

        // Score logic: (Correct * 1) - (Wrong * NegMarking)
        const rawScore = results.correct - (results.wrong * this.activeTest.negMarking);
        results.score = Math.max(0, Math.round((rawScore / results.total) * 100));

        // Storage session details
        results.questions = this.activeTest.questions;
        results.userAnswers = this.activeTest.answers;

        await StorageService.saveResult(results);
        this.showResults(results);
    }

    showResults(results) {
        this.showSection('result-section');
        document.getElementById('score-value').textContent = results.score;
        document.getElementById('stat-correct').textContent = results.correct;
        document.getElementById('stat-wrong').textContent = results.wrong;
        document.getElementById('stat-skipped').textContent = results.skipped;
        
        const progress = document.getElementById('score-progress');
        progress.style.strokeDasharray = `${results.score}, 100`;

        const title = document.getElementById('result-title');
        if (results.score >= 80) title.textContent = "Outstanding Performance!";
        else if (results.score >= 60) title.textContent = "Great Job!";
        else title.textContent = "Keep Practicing!";

        lucide.createIcons();
    }

    async loadDashboard() {
        const history = await StorageService.getHistory();
        const banks = await StorageService.getBanks();
        
        document.getElementById('total-tests').textContent = history.length;
        
        const historyGrid = document.getElementById('recent-history');
        if (history.length > 0) {
            historyGrid.innerHTML = '<h3 style="margin-bottom:1rem">Recent Activity</h3>' + history.reverse().slice(0, 8).map(h => `
                <div class="history-pill animate-up" onclick="window.app.showReview(${h.id})">
                    <div class="h-info">
                        <span class="date">${new Date(h.timestamp).toLocaleDateString()}</span>
                        <div class="stats">${h.correct} Correct, ${h.wrong} Incorrect</div>
                    </div>
                    <span class="score">${h.score}%</span>
                </div>
            `).join('');
        }
    }

    async showReview(historyId) {
        const item = await StorageService.getHistoryItem(historyId);
        if (!item || !item.questions) {
            alert("Detailed data for this older test is not available.");
            return;
        }

        this.showSection('review-section');
        const list = document.getElementById('review-list');
        
        list.innerHTML = item.questions.map((q, i) => {
            const userAns = item.userAnswers[i];
            const isCorrect = userAns === q.answer;
            return `
                <div class="review-item ${isCorrect ? 'correct' : 'incorrect'}">
                    <div class="q-header">Question #${i+1} ${isCorrect ? '✓' : '✗'}</div>
                    <div class="review-q-text">${q.text}</div>
                    <div class="review-opts">
                        ${q.options.map(opt => `
                            <div class="opt-line ${opt.label === q.answer ? 'correct-mark' : ''} ${opt.label === userAns && !isCorrect ? 'wrong-mark' : ''}">
                                <b>${opt.label}:</b> ${opt.text}
                                ${opt.label === q.answer ? ' <span class="badge-tag">Correct</span>' : ''}
                                ${opt.label === userAns && !isCorrect ? ' <span class="badge-tag danger">Your Choice</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                    ${q.hint ? `<div class="review-hint">💡 <i>Hint: ${q.hint}</i></div>` : ''}
                </div>
            `;
        }).join('');

        document.getElementById('retake-btn').onclick = () => {
            this.currentQuestions = item.questions;
            this.showSection('config-section');
        };
    }

    showSection(id) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        window.scrollTo(0, 0);
        lucide.createIcons();
    }

    showStatus(msg, show, isError = false) {
        const box = document.getElementById('upload-status');
        const text = document.getElementById('status-message');
        if (show) {
            box.classList.remove('hidden');
            text.textContent = msg;
            box.style.color = isError ? 'var(--danger)' : 'var(--text-main)';
        } else {
            box.classList.add('hidden');
        }
    }
}

// Global App Instance
const examprep = new App();
window.app = examprep;
