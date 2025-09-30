// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, addDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// **IMPORTANT**: Replace with your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBw9fuKvHh7R_NvNIfoJOHpRe8bKo78il8",
    authDomain: "ai-dropout-system.firebaseapp.com",
    projectId: "ai-dropout-system",
    storageBucket: "ai-dropout-system.appspot.com",
    messagingSenderId: "213229509583",
    appId: "1:213229509583:web:e4ec64bd2bb23df0d650ba",
    measurementId: "G-FL344W57GX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL STATE ---
const AppState = {
    activeUser: null,
    students: {},
    forumPosts: [],
    selectedStudentId: null,
    unsubscribeStudents: null,
    unsubscribeForum: null,
    unsubscribeStudentDoc: null,
    html5QrCode: null,
};

// --- SENTIMENT ANALYZER ---
class SentimentAnalyzer {
    constructor() {
        this.positiveWords = new Set(['good', 'great', 'awesome', 'excellent', 'happy', 'love', 'like', 'amazing', 'best', 'wonderful', 'fantastic', 'superb', 'brilliant', 'congratulations', 'thanks', 'thank you']);
        this.negativeWords = new Set(['bad', 'terrible', 'awful', 'horrible', 'sad', 'hate', 'dislike', 'worst', 'stupid', 'dumb', 'problem', 'issue', 'fail', 'failed']);
    }
    analyze(text) {
        const words = text.toLowerCase().split(/\s+/);
        let score = 0;
        words.forEach(word => {
            if (this.positiveWords.has(word)) score++;
            else if (this.negativeWords.has(word)) score--;
        });
        return score;
    }
}
const sentimentAnalyzer = new SentimentAnalyzer();

// --- AUTHENTICATION ---
onAuthStateChanged(auth, user => {
    if (user && user.email) {
        AppState.activeUser = user;
        document.getElementById('login-screen').classList.add('hidden');
        if (user.email.includes('@counselor.com')) {
            document.getElementById('counselor-dashboard').classList.remove('hidden');
            setupCounselorDashboard();
        } else {
            document.getElementById('student-dashboard').classList.remove('hidden');
            renderStudentDashboard(user.uid);
        }
    } else {
        AppState.activeUser = null;
        document.getElementById('counselor-dashboard').classList.add('hidden');
        document.getElementById('student-dashboard').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        
        document.getElementById('portal-initial-view').classList.remove('hidden');
        document.getElementById('counselor-login-view').classList.add('hidden');
        document.getElementById('student-login-view').classList.add('hidden');

        if (AppState.unsubscribeStudents) AppState.unsubscribeStudents();
        if (AppState.unsubscribeForum) AppState.unsubscribeForum();
        if (AppState.unsubscribeStudentDoc) AppState.unsubscribeStudentDoc();
    }
});

// --- LOGIN/SIGNUP LOGIC ---
function handleAuth(event, role) {
    event.preventDefault();
    const form = event.target;
    const isSignUp = form.parentElement.querySelector('.auth-mode-toggle').checked;
    const username = form.querySelector('input[type="text"]').value;
    const password = form.querySelector('input[type="password"]').value;
    const sanitizedUsername = username.replace(/\s+/g, '').toLowerCase();
    const email = sanitizedUsername + (role === 'counselor' ? '@counselor.com' : '@student.com');
    const errorEl = form.nextElementSibling;
    
    errorEl.classList.add('hidden');

    if (isSignUp) {
        createUserWithEmailAndPassword(auth, email, password)
            .then(userCredential => {
                if (role === 'student') {
                    createInitialStudentData(userCredential.user, username);
                }
            })
            .catch(error => {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
            });
    } else {
        signInWithEmailAndPassword(auth, email, password)
            .catch(error => {
                errorEl.textContent = "Invalid credentials.";
                errorEl.classList.remove('hidden');
            });
    }
}

async function createInitialStudentData(user, fullName) {
    const studentData = {
        name: fullName,
        student_id: Math.floor(100000 + Math.random() * 900000),
        gpa: 2.0,
        attendance: 75,
        prior_failures: 0,
        age: 18,
        address: 'Not set',
        course: 'Undeclared',
        passOutYear: new Date().getFullYear() + 4,
        fees: 'Due',
        results: []
    };
    try {
        await setDoc(doc(db, "students", user.uid), studentData);
    } catch (error) {
        console.error("Error creating student profile:", error);
    }
}

window.handleLogout = function() {
    signOut(auth);
}

// --- MODAL CONTROLS ---
function showModal(id, title, text) {
    const modal = document.getElementById(id);
    modal.querySelector('h2').textContent = title;
    const p = modal.querySelector('p');
    if (p) p.textContent = text;
    modal.classList.remove('hidden');
}

window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
}

window.openEnrollModal = function() {
    document.getElementById('enroll-modal').classList.remove('hidden');
}

// --- COUNSELOR DASHBOARD ---
function setupCounselorDashboard() {
    const studentsQuery = query(collection(db, "students"));
    AppState.unsubscribeStudents = onSnapshot(studentsQuery, (querySnapshot) => {
        AppState.students = {}; 
        querySnapshot.forEach((doc) => {
            AppState.students[doc.id] = { id: doc.id, ...doc.data() };
        });
        fetchAllForumPostsAndUpdateScores();
    }, error => console.error("Error fetching students:", error));
}

async function fetchAllForumPostsAndUpdateScores() {
    const forumQuery = query(collection(db, "forum"));
    const querySnapshot = await getDocs(forumQuery);
    AppState.forumPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStudentList();
}

function calculateRiskScore(student) {
    let score = 0;
    score += (4.0 - (student.gpa || 0)) * 10;
    score += (100 - (student.attendance || 0)) * 0.3;
    if (student.fees === 'Due') score += 20;
    const studentPosts = AppState.forumPosts.filter(p => p.studentId === student.id);
    if (studentPosts.length > 0) {
        const totalSentiment = studentPosts.reduce((acc, post) => acc + sentimentAnalyzer.analyze(post.content), 0);
        const avgSentiment = totalSentiment / studentPosts.length;
        score -= avgSentiment * 5;
    }
    return Math.max(0, Math.min(100, score));
}

function updateStudentList() {
    if (Object.keys(AppState.students).length === 0) return;
    const predictions = Object.values(AppState.students).map(student => {
        student.risk_score = calculateRiskScore(student);
        return student;
    }).sort((a, b) => b.risk_score - a.risk_score);

    const listEl = document.getElementById('students-list'); 
    listEl.innerHTML = '';
    predictions.forEach(student => {
        let riskClass = student.risk_score >= 75 ? 'high-risk' : student.risk_score >= 50 ? 'medium-risk' : 'low-risk';
        const card = document.createElement('div');
        card.className = `student-card ${riskClass}`; 
        card.id = `card-${student.id}`;
        if(student.id === AppState.selectedStudentId) card.classList.add('selected');
        card.onclick = () => selectStudent(student.id, true);
        card.innerHTML = `<div class="risk-score ${riskClass}"><h2>${student.risk_score.toFixed(1)}</h2></div><div class="student-info"><h3>${student.name}</h3><p>ID: ${student.student_id} | GPA: ${student.gpa.toFixed(1)} | Attend: ${Math.round(student.attendance)}%</p></div>`;
        listEl.appendChild(card);
    });
     if (AppState.selectedStudentId && AppState.students[AppState.selectedStudentId]) {
         selectStudent(AppState.selectedStudentId, false);
    } else if (predictions.length > 0) {
         selectStudent(predictions[0].id, true);
    }
}

window.selectStudent = function(studentId, isNewSelection) {
    if (isNewSelection) {
        AppState.selectedStudentId = studentId;
        document.querySelectorAll('.student-card').forEach(c => c.classList.remove('selected'));
        const card = document.getElementById(`card-${studentId}`);
        if (card) card.classList.add('selected');
    }
    
    document.getElementById('deep-dive-placeholder').classList.add('hidden');
    document.getElementById('deep-dive-content').classList.remove('hidden');

    const studentData = AppState.students[studentId];
    if (!studentData) return;
    document.getElementById('student-detail-title').textContent = `Deep Dive: ${studentData.name}`;
    
    const studentPosts = AppState.forumPosts.filter(p => p.studentId === studentData.id);
    const totalSentiment = studentPosts.reduce((acc, post) => acc + sentimentAnalyzer.analyze(post.content), 0);
    const avgSentiment = studentPosts.length > 0 ? totalSentiment / studentPosts.length : 0;

    const explanations = [
         { factor: 'Low GPA', weight: (4.0 - (studentData.gpa || 0)) / 4.0 * 0.4 },
         { factor: 'Low Attendance', weight: (100 - (studentData.attendance || 0)) / 100 * 0.3 },
         { factor: 'Fees Due', weight: studentData.fees === 'Due' ? 0.2 : 0 },
         { factor: 'Negative Sentiment', weight: Math.max(0, -avgSentiment * 0.05) },
    ].sort((a,b) => b.weight - a.weight);

    const limeEl = document.getElementById('lime-explanation');
    limeEl.innerHTML = explanations.slice(0, 3).map(exp => `
        <div class="xai-factor">
            <label>${exp.factor}</label>
            <div class="progress-bar"><div style="width: ${exp.weight*200}%"></div></div>
        </div>
    `).join('');
}

window.handleCounselorAction = async function(actionType) {
    if (!AppState.selectedStudentId) return;
    const student = AppState.students[AppState.selectedStudentId];
    showModal('action-modal', 'Action Logged', `${actionType} for ${student.name}. An in-app notification and email will be sent.`);
};

async function handleEnrollStudent(e) {
    e.preventDefault();
    const studentName = document.getElementById('enroll-name').value;
    const newStudentData = {
        name: studentName, student_id: Math.floor(100000 + Math.random() * 900000), age: parseInt(document.getElementById('enroll-age').value), gpa: parseFloat(document.getElementById('enroll-gpa').value), attendance: parseInt(document.getElementById('enroll-attendance').value), prior_failures: parseInt(document.getElementById('enroll-failures').value), address: 'N/A', course: 'Undeclared', passOutYear: new Date().getFullYear() + 4, fees: 'Paid', results: []
    };

    try {
        await addDoc(collection(db, "students"), newStudentData);
        closeModal('enroll-modal');
        document.getElementById('enroll-form').reset();
    } catch (error) {
        console.error("Error enrolling new student:", error);
    }
}

// --- STUDENT DASHBOARD ---
function renderStudentDashboard(studentId) {
    if (AppState.unsubscribeStudentDoc) AppState.unsubscribeStudentDoc();
    
    const studentRef = doc(db, "students", studentId);
    AppState.unsubscribeStudentDoc = onSnapshot(studentRef, (docSnap) => {
        const profileDetailsEl = document.getElementById('profile-details');
        if (!docSnap.exists()) {
            profileDetailsEl.innerHTML = `<p>Creating profile, please wait...</p>`;
            return;
        }
        const student = docSnap.data();
        AppState.students[studentId] = { id: studentId, ...student };
        
        document.getElementById('student-welcome').textContent = `Welcome, ${student.name.split(' ')[0]}!`;
        
        profileDetailsEl.innerHTML = `
            <div class="profile-item"><label>Student Name</label><p data-field="name" data-editable="true">${student.name}</p></div>
            <div class="profile-item"><label>Student ID</label><p>${student.student_id}</p></div>
            <div class="profile-item"><label>Course Enrolled</label><p data-field="course">${student.course}</p></div>
            <div class="profile-item"><label>Graduation Year</label><p data-field="passOutYear">${student.passOutYear}</p></div>
            <div class="profile-item" style="grid-column: 1 / -1;"><label>Address</label><p data-field="address" data-editable="true">${student.address}</p></div>
            <div class="profile-item"><label>Overall GPA</label><p>${(student.gpa || 0).toFixed(2)}</p></div>
            <div class="profile-item"><label>Attendance</label><p>${Math.round(student.attendance || 0)}%</p></div>
        `;
        
        document.getElementById('results-tbody').innerHTML = (student.results || []).map(r => `
            <tr><td>Semester ${r.sem}</td><td>${r.sgpa}</td><td>${r.status}</td></tr>
        `).join('') || `<tr><td colspan="3" style="text-align: center;">No results posted yet.</td></tr>`;

        const feesContainer = document.getElementById('fees-status-container');
        feesContainer.className = `fees-status ${student.fees ? student.fees.toLowerCase() : 'due'}`;
        feesContainer.innerHTML = `<p>Status: ${student.fees || 'N/A'}</p>`;
        
        const riskScore = calculateRiskScore(student);
        const chatbotTab = document.querySelector('.student-tab[onclick*="chatbot"]');
        if(chatbotTab) chatbotTab.classList.toggle('hidden', riskScore >= 75);
    });

    if (AppState.unsubscribeForum) AppState.unsubscribeForum();
    const forumQuery = query(collection(db, "forum"));
    AppState.unsubscribeForum = onSnapshot(forumQuery, (querySnapshot) => {
        AppState.forumPosts = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderForum();
    });
    setupChatbot();
}

window.toggleProfileEdit = async function(button) {
    const profileDetails = document.getElementById('profile-details');
    const isEditMode = button.textContent.includes('Edit');

    if (isEditMode) {
        button.textContent = '💾 Save Changes';
        profileDetails.querySelectorAll('p[data-editable="true"]').forEach(p => {
            const field = p.dataset.field;
            const value = p.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.dataset.field = field;
            p.replaceWith(input);
        });
    } else {
        button.disabled = true;
        button.textContent = '💾 Saving...';
        
        const dataToUpdate = {};
        const inputsToUpdate = profileDetails.querySelectorAll('input[data-field]');
        
        inputsToUpdate.forEach(input => {
            dataToUpdate[input.dataset.field] = input.value;
        });

        try {
            const studentRef = doc(db, "students", AppState.activeUser.uid);
            await updateDoc(studentRef, dataToUpdate);
            
            // PERMANENT FIX: Manually revert inputs to paragraphs for immediate UI feedback.
            inputsToUpdate.forEach(input => {
                const p = document.createElement('p');
                p.dataset.field = input.dataset.field;
                p.dataset.editable = "true";
                p.textContent = input.value;
                input.replaceWith(p);
            });

        } catch (error) {
            console.error("Error updating profile:", error);
            // On error, the onSnapshot listener will eventually revert the UI.
        } finally {
            button.textContent = '✏️ Edit Profile';
            button.disabled = false;
        }
    }
}

window.switchTab = function(tabName) {
    document.querySelectorAll('.student-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.student-tab[onclick*="${tabName}"]`).classList.add('active');
    document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${tabName}-panel`).classList.add('active');
}

// --- ATTENDANCE ---
const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
    try {
        const studentId = AppState.activeUser.uid;
        const student = AppState.students[studentId];
        if (!student) {
            showModal('action-modal', 'Error', 'Could not find your student data.');
            return;
        }
        
        const studentRef = doc(db, "students", studentId);
        await updateDoc(studentRef, {
            attendance: Math.min(100, (student.attendance || 0) + 1)
        });
        
        showModal('action-modal', 'Success', `Attendance marked for ${student.name}.`);
    } catch (error) {
        console.error("Error processing QR code:", error);
        showModal('action-modal', 'Error', 'Failed to mark attendance.');
    } finally {
        stopStudentScanner();
    }
};

function startStudentScanner() {
    document.getElementById('start-scan-btn').classList.add('hidden');
    document.getElementById('student-reader').classList.remove('hidden');
    document.getElementById('stop-scan-btn').classList.remove('hidden');

    AppState.html5QrCode = new Html5Qrcode("student-reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    AppState.html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
        .catch(err => {
            showModal('action-modal', 'Camera Error', 'Could not start camera. Please grant permission.');
            stopStudentScanner();
        });
}

function stopStudentScanner() {
    if (AppState.html5QrCode && AppState.html5QrCode.isScanning) {
        AppState.html5QrCode.stop().then(resetScannerUI).catch(err => {
            resetScannerUI();
        });
    } else {
        resetScannerUI();
    }
}

function resetScannerUI() {
    AppState.html5QrCode = null;
    document.getElementById('start-scan-btn').classList.remove('hidden');
    document.getElementById('student-reader').classList.add('hidden');
    document.getElementById('stop-scan-btn').classList.add('hidden');
    document.getElementById('student-reader').innerHTML = "";
}

function renderForum() {
    const container = document.getElementById('forum-posts-container');
    container.innerHTML = '<h2>🌐 College Forum</h2>';
    if (!AppState.forumPosts || AppState.forumPosts.length === 0) {
        container.innerHTML += '<p>No posts yet. Be the first to start a conversation!</p>';
        return;
    }
    AppState.forumPosts
        .sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0))
        .forEach(post => {
            const postEl = document.createElement('div');
            postEl.className = 'forum-post';
            postEl.innerHTML = `
                <div class="post-header">
                    <span class="post-author">${post.name}</span>
                    <span class="post-time">${post.timestamp ? new Date(post.timestamp.toDate()).toLocaleString() : 'Just now'}</span>
                </div>
                <p class="post-content">${post.content}</p>
            `;
            container.appendChild(postEl);
        });
}

async function handleCreatePost(e) {
    e.preventDefault();
    const contentEl = document.getElementById('new-post-content');
    const content = contentEl.value.trim();
    if (!content || !AppState.activeUser) return;
    
    const studentRef = doc(db, "students", AppState.activeUser.uid);
    const studentSnap = await getDoc(studentRef);

    if (studentSnap.exists()) {
        const student = studentSnap.data();
        await addDoc(collection(db, "forum"), {
            studentId: AppState.activeUser.uid,
            name: student.name,
            timestamp: serverTimestamp(),
            content: content
        });
        contentEl.value = '';
    }
}

// --- CHATBOT ---
function setupChatbot() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    addChatMessage("Hi! I'm your Sentinel Assistant, powered by Gemini. How can I help you today?", 'bot');
    renderSuggestions(['Academic support', 'Mental well-being', 'Career advice']);
}

async function getStudentDataForChat(studentId) {
    if (AppState.students[studentId]) {
        return AppState.students[studentId];
    }
    const studentRef = doc(db, "students", studentId);
    const docSnap = await getDoc(studentRef);
    if (docSnap.exists()) {
        const studentData = { id: studentId, ...docSnap.data() };
        AppState.students[studentId] = studentData;
        return studentData;
    }
    return null;
}

// =========== MODIFIED CODE START ===========
async function getGeminiResponse(prompt) {
    if (!AppState.activeUser) {
        return "Authentication error. Please log in again.";
    }

    try {
        const student = await getStudentDataForChat(AppState.activeUser.uid);

        if (!student) {
            console.error("Student data not found for active user.");
            return "I'm having trouble accessing your profile details right now.";
        }
        
        // IMPORTANT: Replace this with your actual Render backend URL
        const backendApiUrl = 'https://ai-dropout-prediction-and-counselling-qsxo.onrender.com/';

        const payload = {
            prompt: prompt,
            student: student
        };

        const response = await fetch(backendApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Backend Error: ${response.statusText}`);
        }

        const result = await response.json();
        return result.generated_text || "Sorry, I couldn't get a response.";

    } catch (error) {
        console.error("Error connecting to backend service:", error);
        return "Sorry, I'm having trouble connecting to the AI service. Please try again later.";
    }
}
// =========== MODIFIED CODE END ===========

async function handleSendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    const messageText = input.value.trim();
    if (messageText === '') return;

    addChatMessage(messageText, 'user');
    input.value = ''; 
    document.getElementById('chat-suggestions').innerHTML = '';
    input.disabled = true; 
    document.getElementById('chat-send-btn').disabled = true;
    
    addChatMessage("Thinking...", 'bot');

    try {
        const botResponse = await getGeminiResponse(messageText);
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer.lastChild && messagesContainer.lastChild.textContent === "Thinking...") {
            messagesContainer.removeChild(messagesContainer.lastChild);
        }
        addChatMessage(botResponse, 'bot');
    } catch (error) {
        console.error("Chatbot send error:", error);
        const messagesContainer = document.getElementById('chat-messages');
         if (messagesContainer.lastChild && messagesContainer.lastChild.textContent === "Thinking...") {
            messagesContainer.removeChild(messagesContainer.lastChild);
        }
        addChatMessage("Sorry, I had an error connecting to the AI. Please try again later.", 'bot');
    } finally {
        input.disabled = false;
        document.getElementById('chat-send-btn').disabled = false;
        input.focus();
        renderSuggestions(getDynamicSuggestions(messageText)); 
    }
}

function addChatMessage(message, sender) {
    const el = document.createElement('div');
    el.classList.add('chat-message', `${sender}-message`); 
    el.textContent = message;
    const container = document.getElementById('chat-messages');
    container.appendChild(el); 
    container.scrollTop = container.scrollHeight;
}

function renderSuggestions(suggestions) {
    const container = document.getElementById('chat-suggestions'); container.innerHTML = '';
    suggestions.forEach(text => {
        const chip = document.createElement('div'); chip.className = 'suggestion-chip';
        chip.textContent = text;
        chip.onclick = () => { document.getElementById('chat-input').value = text; document.getElementById('chat-input-form').dispatchEvent(new Event('submit')); };
        container.appendChild(chip);
    });
}

function getDynamicSuggestions(lastInput) {
    const lowerInput = lastInput.toLowerCase();
    if (lowerInput.includes('academic') || lowerInput.includes('study')) { return ['Time management', 'Writing center']; }
    if (lowerInput.includes('stress') || lowerInput.includes('anxiety')) { return ['Counseling services', 'Peer support']; }
    return ['Academic support', 'Mental well-being', 'Career advice'];
}

// --- INITIALIZE APP ---
function init() {
    document.getElementById('show-counselor-login').addEventListener('click', () => {
        document.getElementById('portal-initial-view').classList.add('hidden');
        document.getElementById('counselor-login-view').classList.remove('hidden');
    });

    document.getElementById('show-student-login').addEventListener('click', () => {
        document.getElementById('portal-initial-view').classList.add('hidden');
        document.getElementById('student-login-view').classList.remove('hidden');
    });

    document.querySelectorAll('.back-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.getElementById('portal-initial-view').classList.remove('hidden');
            document.getElementById('counselor-login-view').classList.add('hidden');
            document.getElementById('student-login-view').classList.add('hidden');
        });
    });

    document.getElementById('counselor-login-form').addEventListener('submit', (e) => handleAuth(e, 'counselor'));
    document.getElementById('student-login-form').addEventListener('submit', (e) => handleAuth(e, 'student'));
    document.getElementById('new-post-form').addEventListener('submit', handleCreatePost);
    document.getElementById('chat-input-form').addEventListener('submit', handleSendMessage);
    document.getElementById('enroll-form').addEventListener('submit', handleEnrollStudent);
    document.getElementById('start-scan-btn').addEventListener('click', startStudentScanner);
    document.getElementById('stop-scan-btn').addEventListener('click', stopStudentScanner);
    
    document.getElementById('generate-qr-btn').addEventListener('click', async () => {
        const studentId = AppState.activeUser.uid;
        const timestamp = Date.now();
        const qrData = `${studentId}|${timestamp}`;
    
        const qr = qrcode(0, 'L');
        qr.addData(qrData);
        qr.make();
        document.getElementById('qr-code').innerHTML = qr.createImgTag(6);
    });

    document.querySelectorAll('.auth-mode-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const role = e.target.dataset.role;
            const form = document.getElementById(`${role}-login-form`);
            const button = form.querySelector('button');
            const isSignUp = e.target.checked;
            button.textContent = isSignUp ? `Sign Up as ${role.charAt(0).toUpperCase() + role.slice(1)}` : `Login as ${role.charAt(0).toUpperCase() + role.slice(1)}`;
        });
    });

    const statusEl = document.getElementById('chatbot-status');
    if (statusEl) statusEl.textContent = "(Online)";
}


document.addEventListener('DOMContentLoaded', init);


