/**
 * PDF Parsing Engine for ExamPrep Pro
 * Uses pdf.js to extract text and regex to structure questions.
 */

// Set worker path for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

export class PDFParser {
    static async extractText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        return fullText;
    }

    /**
     * Attempts to parse questions from raw text.
     * Supports both PDF structure and OCR/Image structures.
     */
    static parseQuestions(text, currentCount = 0) {
        // Cleaning: Tesseract often adds weird chars, remove non-standard symbols but keep important ones
        const cleanText = text.replace(/[^a-zA-Z0-9\s\.\?\:\(\)\-\ufffd\u25a0]/g, ' ');
        const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        const questions = [];
        let currentQ = null;

        lines.forEach(line => {
            // New Question detection: Q:, Q1:, 1., Question:
            const qMatch = line.match(/^(?:Q|Question|\d+)\s*[:\.\)]\s*(.*)/i);
            
            if (qMatch) {
                if (currentQ) questions.push(currentQ);
                currentQ = {
                    id: Date.now() + Math.random(),
                    text: qMatch[1],
                    options: [],
                    answer: 'A',
                    hint: ''
                };
            } else if (currentQ) {
                // Option detection: A) text B) text...
                const optMatches = line.matchAll(/(?:\(?([A-D])[\.\)]\s*)(.*?)(?=(?:\(?([A-D])[\.\)]\s*)|$)/gi);
                let foundOptions = false;
                for (const match of optMatches) {
                    currentQ.options.push({ label: match[1].toUpperCase(), text: match[2].trim() });
                    foundOptions = true;
                }

                if (!foundOptions) {
                    // Answer detection: Answer: [Label or Text]
                    const ansMatch = line.match(/(?:Ans|Answer|Correct)[:\s]+(.*)/i);
                    const trickMatch = line.match(/(?:Trick|Hint|Note)[:\s]+(.*)/i);
                    
                    if (ansMatch) {
                        const val = ansMatch[1].trim();
                        // If it's a single letter, use it. If it's text, try to find it in options.
                        if (val.length === 1 && /[A-D]/i.test(val)) {
                            currentQ.answer = val.toUpperCase();
                        } else {
                            currentQ.pendingAnswerText = val;
                        }
                    } else if (trickMatch) {
                        currentQ.hint = trickMatch[1];
                    } else if (!line.includes('Trick:')) {
                        // If it's just a regular line and we have a Q, append to Q text
                        currentQ.text += ' ' + line;
                    }
                }
            }
        });

        if (currentQ) questions.push(currentQ);

        // Final cleanup for mapping text-answers to labels
        questions.forEach(q => {
            if (q.pendingAnswerText && q.options.length > 0) {
                const found = q.options.find(o => 
                    o.text.toLowerCase().includes(q.pendingAnswerText.toLowerCase()) ||
                    q.pendingAnswerText.toLowerCase().includes(o.text.toLowerCase())
                );
                if (found) q.answer = found.label;
            }
            delete q.pendingAnswerText;
        });

        return questions;
    }

    // Fallback if options aren't clearly structured
    static generateMockOptions(part) {
        // Try to find any capitalized words that look like options if regex failed
        return [
            { label: 'A', text: 'Option A (Review required)' },
            { label: 'B', text: 'Option B' },
            { label: 'C', text: 'Option C' },
            { label: 'D', text: 'Option D' }
        ];
    }
}
